import { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  documentId,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { PlayerProfile, PresenceStatus } from '../types/social';
import {
  isFirestoreQuotaExceededError,
  isFirestoreQuotaPaused,
  subscribeFirestoreQuotaState,
  trackFirestoreOp,
  triggerFirestoreQuotaCooldown,
} from '../utils/firestoreDiagnostics';

export const PLAYER_PROFILES_COLLECTION = 'playerProfiles';
export const SOCIAL_FALLBACK_COLLECTION = 'gameSessions';

// Fallback crash timeout ONLY when a browser crashes without firing pagehide/signOut
export const PRESENCE_CRASH_STALE_MS = 160_000;
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 75_000;
const EXPLICIT_PRESENCE_DEDUP_MS = 15_000;
const PROFILE_SYNC_DEDUP_MS = 15_000;

const TAB_SESSION_ID = `sess_${Date.now().toString(36)}_${Math.random()
  .toString(36)
  .slice(2, 8)}`;

let cachedIdToken: string | null = null;
const cachedAcceptsInvitesByUid = new Map<string, boolean>();
const lastProfileSyncByUid = new Map<string, number>();
let activePresenceState: {
  uid: string;
  status: Exclude<PresenceStatus, 'offline'>;
  roomCode: string | null;
} | null = null;

let lastExplicitPresenceWrite: {
  key: string;
  sentAt: number;
} | null = null;

// Mode detection: prefers native hardened collections when rules are deployed,
// seamlessly falls back to gameSessions (soc_* docs) if console rules haven't been updated yet.
let socialStoreMode: 'unknown' | 'native' | 'fallback' = 'unknown';
let storeProbePromise: Promise<'native' | 'fallback'> | null = null;

export function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code || '';
  const msg = (err as { message?: string }).message || '';
  return (
    code === 'permission-denied' ||
    code.endsWith('permission-denied') ||
    msg.toLowerCase().includes('permission_denied') ||
    msg.toLowerCase().includes('insufficient permissions')
  );
}

export function isUsingFallbackSocialStore(): boolean {
  return socialStoreMode === 'fallback';
}

export function getCurrentSocialStoreMode(): 'unknown' | 'native' | 'fallback' {
  return socialStoreMode;
}

export function enableFallbackSocialStore(): void {
  socialStoreMode = 'fallback';
}

export function resetSocialStoreModeForTest(): void {
  socialStoreMode = 'unknown';
  storeProbePromise = null;
  lastExplicitPresenceWrite = null;
  activePresenceState = null;
  cachedIdToken = null;
  cachedAcceptsInvitesByUid.clear();
  lastProfileSyncByUid.clear();
}

export function setCachedAcceptsInvitesPreference(uid: string, acceptsInvites: boolean): void {
  if (uid) {
    cachedAcceptsInvitesByUid.set(uid, acceptsInvites);
  }
}

export function logSocialTrace(
  action: string,
  details: {
    storeMode?: string;
    status?: number | string;
    code?: string;
    reason?: string;
    inviteType?: string;
    hasRoomCode?: boolean;
  }
): void {
  console.warn('[NIZAL Social Trace]', {
    action,
    storeMode: details.storeMode || socialStoreMode,
    ...(details.status !== undefined ? { status: details.status } : {}),
    ...(details.code ? { code: details.code } : {}),
    ...(details.reason ? { reason: details.reason } : {}),
    ...(details.inviteType ? { inviteType: details.inviteType } : {}),
    ...(details.hasRoomCode !== undefined ? { hasRoomCode: details.hasRoomCode } : {}),
  });
}

export async function ensureSocialStoreMode(
  probeUid?: string
): Promise<'native' | 'fallback'> {
  if (socialStoreMode !== 'unknown') return socialStoreMode;
  if (!probeUid) return 'native';
  if (isFirestoreQuotaPaused()) return 'native';
  if (storeProbePromise) return storeProbePromise;

  storeProbePromise = (async () => {
    try {
      trackFirestoreOp('presence', 'read', 1, 'ensureSocialStoreMode');
      await getDoc(doc(db, PLAYER_PROFILES_COLLECTION, probeUid));
      socialStoreMode = 'native';
    } catch (err) {
      if (isFirestoreQuotaExceededError(err)) {
        triggerFirestoreQuotaCooldown('presence', err);
        return 'native';
      }
      if (isPermissionDeniedError(err)) {
        socialStoreMode = 'fallback';
      } else {
        socialStoreMode = 'native';
      }
    } finally {
      storeProbePromise = null;
    }
    return socialStoreMode;
  })();

  return storeProbePromise;
}

export function getProfileDocRef(uid: string) {
  return socialStoreMode === 'fallback'
    ? doc(db, SOCIAL_FALLBACK_COLLECTION, `soc_prof_${uid}`)
    : doc(db, PLAYER_PROFILES_COLLECTION, uid);
}

export function getPresenceSessionId(): string {
  return TAB_SESSION_ID;
}

export async function refreshCachedAuthToken(user: User | null): Promise<void> {
  if (!user) {
    cachedIdToken = null;
    return;
  }
  try {
    cachedIdToken = await user.getIdToken();
  } catch {
    // ignore token fetch failure
  }
}

export function resolveEffectivePresence(
  profile?: Partial<PlayerProfile> | null
): PresenceStatus {
  if (!profile) return 'offline';
  if (!profile.isExplicitlyOnline || profile.presenceStatus === 'offline') {
    return 'offline';
  }
  if (
    typeof profile.lastHeartbeat === 'number' &&
    profile.lastHeartbeat > 0 &&
    Date.now() - profile.lastHeartbeat > PRESENCE_CRASH_STALE_MS
  ) {
    return 'offline';
  }
  return profile.presenceStatus || 'online';
}

export function formatPresenceLabel(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'متصل الآن';
    case 'in_lobby':
      return 'داخل غرفة انتظار';
    case 'in_match':
      return 'داخل مباراة';
    case 'offline':
    default:
      return 'غير متصل';
  }
}

export async function syncPublicPlayerProfile(
  user: User,
  overrides?: {
    displayName?: string;
    presenceStatus?: PresenceStatus;
    isExplicitlyOnline?: boolean;
    currentRoomCode?: string | null;
  }
): Promise<void> {
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('presence', 'dedup_skip', 1, 'quota_paused_sync_profile');
    return;
  }
  const now = Date.now();
  const hasExplicitOverrides = Boolean(
    overrides &&
      (overrides.presenceStatus !== undefined ||
        overrides.isExplicitlyOnline !== undefined ||
        overrides.currentRoomCode !== undefined)
  );
  if (!hasExplicitOverrides) {
    const prevSyncAt = lastProfileSyncByUid.get(user.uid) || 0;
    if (now - prevSyncAt < PROFILE_SYNC_DEDUP_MS) {
      trackFirestoreOp('presence', 'dedup_skip', 1, 'recent_sync_profile');
      return;
    }
  }

  const mode = await ensureSocialStoreMode(user.uid);
  const resolvedName = (
    overrides?.displayName ||
    user.displayName ||
    user.email?.split('@')[0] ||
    'لاعب نِزال'
  ).trim();

  if (!cachedIdToken) {
    await refreshCachedAuthToken(user);
  }

  const readRef =
    mode === 'fallback'
      ? doc(db, SOCIAL_FALLBACK_COLLECTION, `soc_prof_${user.uid}`)
      : doc(db, PLAYER_PROFILES_COLLECTION, user.uid);

  let acceptsInvites = cachedAcceptsInvitesByUid.get(user.uid) ?? true;
  if (!cachedAcceptsInvitesByUid.has(user.uid)) {
    try {
      trackFirestoreOp('presence', 'read', 1, 'syncPublicPlayerProfile');
      const snap = await getDoc(readRef);
      if (snap.exists()) {
        const existing = snap.data() as PlayerProfile;
        if (typeof existing.acceptsInvites === 'boolean') {
          acceptsInvites = existing.acceptsInvites;
        }
      }
      cachedAcceptsInvitesByUid.set(user.uid, acceptsInvites);
    } catch (err) {
      if (isFirestoreQuotaExceededError(err)) {
        triggerFirestoreQuotaCooldown('presence', err);
        return;
      }
      // proceed with default
    }
  }

  const nextStatus: PresenceStatus = overrides?.presenceStatus || 'online';
  const nextExplicit =
    typeof overrides?.isExplicitlyOnline === 'boolean'
      ? overrides.isExplicitlyOnline
      : nextStatus !== 'offline';
  const resolvedRoomCode =
    overrides?.currentRoomCode !== undefined ? overrides.currentRoomCode : null;

  const payload: PlayerProfile = {
    uid: user.uid,
    displayName: resolvedName,
    displayNameLower: resolvedName.toLowerCase(),
    photoURL: user.photoURL || '',
    acceptsInvites,
    presenceStatus: nextStatus,
    isExplicitlyOnline: nextExplicit,
    currentRoomCode: resolvedRoomCode,
    sessionId: TAB_SESSION_ID,
    lastHeartbeat: now,
    updatedAt: now,
  };

  if (nextExplicit && nextStatus !== 'offline') {
    activePresenceState = {
      uid: user.uid,
      status: nextStatus,
      roomCode: resolvedRoomCode,
    };
  }

  const explicitKey = `${user.uid}|${nextStatus}|${nextExplicit ? resolvedRoomCode || '' : ''}`;

  if (mode === 'fallback') {
    trackFirestoreOp('presence', 'write', 1, 'syncPublicPlayerProfile_fallback');
    await setDoc(
      doc(db, SOCIAL_FALLBACK_COLLECTION, `soc_prof_${user.uid}`),
      { ...payload, socialDocType: 'playerProfile', _deleted: false },
      { merge: true }
    );
    lastProfileSyncByUid.set(user.uid, now);
    lastExplicitPresenceWrite = { key: explicitKey, sentAt: now };
    return;
  }

  try {
    trackFirestoreOp('presence', 'write', 1, 'syncPublicPlayerProfile');
    await setDoc(doc(db, PLAYER_PROFILES_COLLECTION, user.uid), payload, {
      merge: true,
    });
    lastProfileSyncByUid.set(user.uid, now);
    lastExplicitPresenceWrite = { key: explicitKey, sentAt: now };
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('presence', err);
      return;
    }
    if (isPermissionDeniedError(err)) {
      enableFallbackSocialStore();
      trackFirestoreOp('presence', 'write', 1, 'syncPublicPlayerProfile_fallback');
      await setDoc(
        doc(db, SOCIAL_FALLBACK_COLLECTION, `soc_prof_${user.uid}`),
        { ...payload, socialDocType: 'playerProfile', _deleted: false },
        { merge: true }
      );
      lastProfileSyncByUid.set(user.uid, now);
      lastExplicitPresenceWrite = { key: explicitKey, sentAt: now };
    } else {
      throw err;
    }
  }
}

export async function setExplicitPresence(
  user: User,
  status: PresenceStatus,
  currentRoomCode: string | null = null
): Promise<void> {
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('presence', 'dedup_skip', 1, 'quota_paused_explicit');
    return;
  }

  const now = Date.now();
  const isOnline = status !== 'offline';
  const resolvedRoom = isOnline ? currentRoomCode : null;
  const dedupKey = `${user.uid}|${status}|${resolvedRoom || ''}`;
  if (
    lastExplicitPresenceWrite &&
    lastExplicitPresenceWrite.key === dedupKey &&
    now - lastExplicitPresenceWrite.sentAt < EXPLICIT_PRESENCE_DEDUP_MS
  ) {
    trackFirestoreOp('presence', 'dedup_skip', 1, `explicit:${status}`);
    return;
  }

  const mode = await ensureSocialStoreMode(user.uid);
  if (isOnline) {
    activePresenceState = {
      uid: user.uid,
      status: status as Exclude<PresenceStatus, 'offline'>,
      roomCode: currentRoomCode,
    };
  } else {
    activePresenceState = null;
  }

  const ref =
    mode === 'fallback'
      ? doc(db, SOCIAL_FALLBACK_COLLECTION, `soc_prof_${user.uid}`)
      : doc(db, PLAYER_PROFILES_COLLECTION, user.uid);

  try {
    trackFirestoreOp('presence', 'write', 1, `explicit:${status}`);
    await updateDoc(ref, {
      presenceStatus: status,
      isExplicitlyOnline: isOnline,
      currentRoomCode: resolvedRoom,
      sessionId: TAB_SESSION_ID,
      lastHeartbeat: now,
      updatedAt: now,
    });
    lastExplicitPresenceWrite = { key: dedupKey, sentAt: now };
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('presence', err);
      return;
    }
    await syncPublicPlayerProfile(user, {
      presenceStatus: status,
      isExplicitlyOnline: isOnline,
      currentRoomCode: resolvedRoom,
    });
    lastExplicitPresenceWrite = { key: dedupKey, sentAt: Date.now() };
  }
}

export async function sendPresenceHeartbeat(user: User): Promise<void> {
  if (!user) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('presence', 'dedup_skip', 1, 'quota_paused_heartbeat');
    return;
  }

  const mode = await ensureSocialStoreMode(user.uid);
  await refreshCachedAuthToken(user);
  const status = activePresenceState?.status || 'online';
  const roomCode = activePresenceState?.roomCode ?? null;
  const ref =
    mode === 'fallback'
      ? doc(db, SOCIAL_FALLBACK_COLLECTION, `soc_prof_${user.uid}`)
      : doc(db, PLAYER_PROFILES_COLLECTION, user.uid);
  const now = Date.now();

  try {
    trackFirestoreOp('presence', 'write', 1, 'heartbeat');
    await updateDoc(ref, {
      presenceStatus: status,
      isExplicitlyOnline: true,
      currentRoomCode: roomCode,
      sessionId: TAB_SESSION_ID,
      lastHeartbeat: now,
      updatedAt: now,
    });
    lastExplicitPresenceWrite = { key: `${user.uid}|${status}|${roomCode || ''}`, sentAt: now };
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('presence', err);
      return;
    }
    await syncPublicPlayerProfile(user, {
      presenceStatus: status,
      isExplicitlyOnline: true,
      currentRoomCode: roomCode,
    });
  }
}

export async function markPresenceOfflineNow(uid: string): Promise<void> {
  activePresenceState = null;
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('presence', 'dedup_skip', 1, 'quota_paused_mark_offline');
    return;
  }
  const mode = await ensureSocialStoreMode(uid);
  const now = Date.now();
  const ref =
    mode === 'fallback'
      ? doc(db, SOCIAL_FALLBACK_COLLECTION, `soc_prof_${uid}`)
      : doc(db, PLAYER_PROFILES_COLLECTION, uid);
  try {
    await updateDoc(ref, {
      presenceStatus: 'offline',
      isExplicitlyOnline: false,
      currentRoomCode: null,
      updatedAt: now,
    });
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('presence', err);
    }
    // ignore if user already signed out or doc missing
  }
}

// Synchronous keepalive REST patch so tab/window close immediately transitions user offline
export function sendOfflineKeepaliveBeacon(uid: string): void {
  if (!uid || !cachedIdToken || !firebaseConfig.projectId || isFirestoreQuotaPaused()) return;
  const dbId =
    firebaseConfig.firestoreDatabaseId &&
    firebaseConfig.firestoreDatabaseId.trim() !== ''
      ? firebaseConfig.firestoreDatabaseId
      : '(default)';
  const col =
    socialStoreMode === 'fallback'
      ? SOCIAL_FALLBACK_COLLECTION
      : PLAYER_PROFILES_COLLECTION;
  const docId =
    socialStoreMode === 'fallback' ? `soc_prof_${uid}` : uid;

  const endpoint = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(
    dbId
  )}/documents/${col}/${encodeURIComponent(
    docId
  )}?updateMask.fieldPaths=presenceStatus&updateMask.fieldPaths=isExplicitlyOnline&updateMask.fieldPaths=currentRoomCode&updateMask.fieldPaths=updatedAt`;

  const body = JSON.stringify({
    fields: {
      presenceStatus: { stringValue: 'offline' },
      isExplicitlyOnline: { booleanValue: false },
      currentRoomCode: { nullValue: null },
      updatedAt: { integerValue: String(Date.now()) },
    },
  });

  try {
    void fetch(endpoint, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cachedIdToken}`,
      },
      body,
    });
  } catch {
    // ignore keepalive failure on unload
  }
}

// Subscribe in real-time to a list of player UIDs (chunks of 30 due to Firestore `in` limit)
export function subscribeToPlayerProfiles(
  uids: string[],
  onUpdate: (profilesMap: Record<string, PlayerProfile>) => void
): () => void {
  const uniqueUids = Array.from(new Set(uids.filter(Boolean)));
  if (uniqueUids.length === 0) {
    onUpdate({});
    return () => {};
  }
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('presence', 'dedup_skip', 1, 'quota_paused_sub_profiles');
    return () => {};
  }

  let disposed = false;
  const profilesMap: Record<string, PlayerProfile> = {};
  let unsubscribers: (() => void)[] = [];

  const attach = (mode: 'native' | 'fallback') => {
    unsubscribers.forEach((u) => u());
    unsubscribers = [];
    if (disposed || isFirestoreQuotaPaused()) return;

    for (let i = 0; i < uniqueUids.length; i += 30) {
      const chunk = uniqueUids.slice(i, i + 30);
      const docIds =
        mode === 'fallback' ? chunk.map((u) => `soc_prof_${u}`) : chunk;
      const colName =
        mode === 'fallback'
          ? SOCIAL_FALLBACK_COLLECTION
          : PLAYER_PROFILES_COLLECTION;
      const q = query(
        collection(db, colName),
        where(documentId(), 'in', docIds)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          snap.docs.forEach((d) => {
            const data = d.data() as PlayerProfile & { _deleted?: boolean };
            if (data._deleted) return;
            const resolvedUid = data.uid || d.id.replace(/^soc_prof_/, '');
            profilesMap[resolvedUid] = { ...data, uid: resolvedUid };
          });
          onUpdate({ ...profilesMap });
        },
        (err) => {
          if (isFirestoreQuotaExceededError(err)) {
            triggerFirestoreQuotaCooldown('presence', err);
            return;
          }
          if (mode === 'native' && isPermissionDeniedError(err)) {
            enableFallbackSocialStore();
            attach('fallback');
          } else {
            console.warn('Error subscribing to friend profiles:', err);
          }
        }
      );
      unsubscribers.push(unsub);
    }
  };

  const unsubQuota = subscribeFirestoreQuotaState((state) => {
    if (state.paused) {
      unsubscribers.forEach((u) => u());
      unsubscribers = [];
    }
  });

  ensureSocialStoreMode(uniqueUids[0]).then((mode) => attach(mode));

  return () => {
    disposed = true;
    unsubQuota();
    unsubscribers.forEach((u) => u());
  };
}

export function subscribeToMyPlayerProfile(
  uid: string,
  onUpdate: (profile: PlayerProfile | null) => void
): () => void {
  if (!uid) {
    onUpdate(null);
    return () => {};
  }
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('presence', 'dedup_skip', 1, 'quota_paused_sub_my_profile');
    return () => {};
  }

  let disposed = false;
  let unsub: (() => void) | null = null;

  const attach = (mode: 'native' | 'fallback') => {
    unsub?.();
    if (disposed || isFirestoreQuotaPaused()) return;

    const docRef =
      mode === 'fallback'
        ? doc(db, SOCIAL_FALLBACK_COLLECTION, `soc_prof_${uid}`)
        : doc(db, PLAYER_PROFILES_COLLECTION, uid);

    unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PlayerProfile & { _deleted?: boolean };
          if (!data._deleted) {
            onUpdate({ ...data, uid: data.uid || uid });
            return;
          }
        }
        onUpdate(null);
      },
      (err) => {
        if (isFirestoreQuotaExceededError(err)) {
          triggerFirestoreQuotaCooldown('presence', err);
          return;
        }
        if (mode === 'native' && isPermissionDeniedError(err)) {
          enableFallbackSocialStore();
          attach('fallback');
        } else {
          console.warn('Error subscribing to own player profile:', err);
        }
      }
    );
  };

  const unsubQuota = subscribeFirestoreQuotaState((state) => {
    if (state.paused) {
      unsub?.();
      unsub = null;
    }
  });

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
    unsubQuota();
    unsub?.();
  };
}
