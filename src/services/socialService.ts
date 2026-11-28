import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  FriendRequest,
  Friendship,
  GameInvite,
  GameInviteType,
  PlayerProfile,
  UserBlock,
  UserNotification,
} from '../types/social';
import { OnlineGameRoom } from '../types/multiplayer';
import {
  PLAYER_PROFILES_COLLECTION,
  SOCIAL_FALLBACK_COLLECTION,
  enableFallbackSocialStore,
  ensureSocialStoreMode,
  isPermissionDeniedError,
  logSocialTrace,
  setCachedAcceptsInvitesPreference,
} from './presenceService';
import { RoomApiError, fetchOnlineRoom } from './multiplayerService';
import {
  FIRESTORE_QUOTA_EXCEEDED_MESSAGE,
  isFirestoreQuotaExceededError,
  isFirestoreQuotaPaused,
  subscribeFirestoreQuotaState,
  trackFirestoreOp,
  triggerFirestoreQuotaCooldown,
} from '../utils/firestoreDiagnostics';

const BLOCKS_COL = 'userBlocks';
const REQUESTS_COL = 'friendRequests';
const FRIENDSHIPS_COL = 'friendships';
const INVITES_COL = 'gameInvites';
const NOTIFICATIONS_COL = 'notifications';

export const INVITE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function getSortedPairId(uidA: string, uidB: string): {
  pairId: string;
  user1: string;
  user2: string;
} {
  const [user1, user2] = uidA < uidB ? [uidA, uidB] : [uidB, uidA];
  return { pairId: `${user1}_${user2}`, user1, user2 };
}

function getDisplayName(user: User): string {
  return (user.displayName || user.email?.split('@')[0] || 'لاعب نِزال').trim();
}

function getRef(
  kind: 'profile' | 'block' | 'request' | 'friendship' | 'invite' | 'notification',
  id: string,
  mode: 'native' | 'fallback'
) {
  if (mode === 'native') {
    const colMap = {
      profile: PLAYER_PROFILES_COLLECTION,
      block: BLOCKS_COL,
      request: REQUESTS_COL,
      friendship: FRIENDSHIPS_COL,
      invite: INVITES_COL,
      notification: NOTIFICATIONS_COL,
    };
    return doc(db, colMap[kind], id);
  }
  const prefixMap = {
    profile: 'soc_prof_',
    block: 'soc_blk_',
    request: 'soc_req_',
    friendship: 'soc_fr_',
    invite: 'soc_inv_',
    notification: 'soc_notif_',
  };
  return doc(db, SOCIAL_FALLBACK_COLLECTION, `${prefixMap[kind]}${id}`);
}

export function formatSocialErrorMessage(
  err: unknown,
  fallback = 'تعذر تنفيذ الطلب. يرجى المحاولة مجدداً.'
): string {
  if (isFirestoreQuotaExceededError(err)) {
    return FIRESTORE_QUOTA_EXCEEDED_MESSAGE;
  }
  if (err instanceof RoomApiError) {
    return err.message || fallback;
  }

  const code = String((err as { code?: string })?.code || '').toLowerCase();
  const rawMessage = String((err as { message?: string })?.message || '').trim();
  const lowerMessage = rawMessage.toLowerCase();

  if (code.includes('permission-denied') || lowerMessage.includes('missing or insufficient permissions')) {
    return 'تعذر إتمام العملية بسبب قيود الصلاحيات في قاعدة البيانات. يرجى إعادة تسجيل الدخول أو تحديث الصفحة.';
  }
  if (code.includes('unauthenticated')) {
    return 'انتهت جلسة تسجيل الدخول. يرجى تسجيل الخروج ثم الدخول مجدداً.';
  }
  if (
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('offline')
  ) {
    return 'تعذر الاتصال بالخادم حالياً. تحقق من اتصال الإنترنت ثم أعد المحاولة.';
  }
  if (code.includes('invalid-argument') || code.includes('failed-precondition')) {
    return 'تعذر حفظ الطلب بسبب عدم تطابق البيانات. يرجى تحديث الصفحة والمحاولة مجدداً.';
  }
  if (code.includes('not-found')) {
    return 'السجل المطلوب غير موجود أو لم يعد متاحاً.';
  }

  if (rawMessage && /[\u0600-\u06FF]/.test(rawMessage)) {
    return rawMessage;
  }

  return fallback;
}

function classifySocialErrorCode(err: unknown): string {
  if (isFirestoreQuotaExceededError(err)) return 'firestore/quota-exceeded';
  if (isPermissionDeniedError(err)) return 'firestore/permission-denied';
  if (err instanceof RoomApiError) return err.code || `HTTP_${err.status}`;
  const rawCode = String((err as { code?: string })?.code || '').trim();
  if (rawCode) return rawCode;
  const lowerMsg = String((err as { message?: string })?.message || '').toLowerCase();
  if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('network') || lowerMsg.includes('offline')) {
    return 'network/offline';
  }
  return 'social/unknown-error';
}

export async function isBlockedBetween(uidA: string, uidB: string): Promise<{
  blockedByMe: boolean;
  blockedMe: boolean;
}> {
  const mode = await ensureSocialStoreMode(uidA);
  const readPair = async (targetMode: 'native' | 'fallback') =>
    Promise.all([
      getDoc(getRef('block', `${uidA}_${uidB}`, targetMode)),
      getDoc(getRef('block', `${uidB}_${uidA}`, targetMode)),
    ]);

  let docs;
  try {
    docs = await readPair(mode);
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('social', err);
      throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
    }
    logSocialTrace('isBlockedBetween', {
      storeMode: mode,
      code: classifySocialErrorCode(err),
      reason: 'block_read_fallback',
    });
    const altMode = mode === 'native' ? 'fallback' : 'native';
    docs = await readPair(altMode).catch(() => [null, null] as const);
  }

  const [aDoc, bDoc] = docs;
  const aActive = Boolean(aDoc && aDoc.exists() && !(aDoc.data() as { _deleted?: boolean })?._deleted);
  const bActive = Boolean(bDoc && bDoc.exists() && !(bDoc.data() as { _deleted?: boolean })?._deleted);
  return {
    blockedByMe: aActive,
    blockedMe: bActive,
  };
}

// =========================================================================
// 1. SEARCH PLAYERS (Strictly Public Non-PII playerProfiles)
// =========================================================================
export async function searchPlayersByUsername(
  searchTerm: string,
  currentUid: string
): Promise<PlayerProfile[]> {
  const clean = searchTerm.trim().toLowerCase();
  if (!clean) return [];

  const mode = await ensureSocialStoreMode(currentUid);

  if (mode === 'native') {
    try {
      const q = query(
        collection(db, PLAYER_PROFILES_COLLECTION),
        orderBy('displayNameLower'),
        limit(100)
      );
      const snap = await getDocs(q);
      const results: PlayerProfile[] = [];
      snap.forEach((docSnap) => {
        const profile = docSnap.data() as PlayerProfile;
        if (!profile.uid || profile.uid === currentUid) return;
        const nameMatch = (profile.displayName || '').toLowerCase().includes(clean);
        const lowerMatch = (profile.displayNameLower || '').includes(clean);
        if (nameMatch || lowerMatch) {
          results.push(profile);
        }
      });
      return results.slice(0, 25);
    } catch (err) {
      if (!isPermissionDeniedError(err)) throw err;
      enableFallbackSocialStore();
    }
  }

  const qFallback = query(
    collection(db, SOCIAL_FALLBACK_COLLECTION),
    where('socialDocType', '==', 'playerProfile'),
    limit(200)
  );
  const snap = await getDocs(qFallback);
  const results: PlayerProfile[] = [];
  snap.forEach((docSnap) => {
    const profile = docSnap.data() as PlayerProfile & { _deleted?: boolean };
    if (profile._deleted) return;
    if (!profile.uid || profile.uid === currentUid) return;
    const nameMatch = (profile.displayName || '').toLowerCase().includes(clean);
    const lowerMatch = (profile.displayNameLower || '').includes(clean);
    if (nameMatch || lowerMatch) {
      results.push(profile);
    }
  });
  return results.slice(0, 25);
}

// =========================================================================
// 2. FRIEND REQUESTS & FRIENDSHIPS
// =========================================================================
export async function sendFriendRequest(
  currentUser: User,
  targetPlayer: Pick<PlayerProfile, 'uid' | 'displayName' | 'photoURL'>
): Promise<void> {
  if (!currentUser?.uid) throw new Error('يجب تسجيل الدخول أولاً');
  if (!targetPlayer?.uid || targetPlayer.uid === currentUser.uid) {
    throw new Error('لا يمكنك إرسال طلب صداقة إلى نفسك');
  }

  const mode = await ensureSocialStoreMode(currentUser.uid);

  const blockState = await isBlockedBetween(currentUser.uid, targetPlayer.uid);
  if (blockState.blockedByMe) {
    throw new Error('لقد قمت بحظر هذا اللاعب. قم بإلغاء الحظر أولاً');
  }
  if (blockState.blockedMe) {
    throw new Error('تعذر إرسال طلب الصداقة لهذا المستخدم');
  }

  const { pairId } = getSortedPairId(currentUser.uid, targetPlayer.uid);
  const existingFriend = await getDoc(getRef('friendship', pairId, mode)).catch(() => null);
  if (
    existingFriend &&
    existingFriend.exists() &&
    !(existingFriend.data() as { _deleted?: boolean })?._deleted
  ) {
    throw new Error('أنتما أصدقاء بالفعل');
  }

  // Check if target already sent an incoming pending request to currentUser
  const reverseReqId = `${targetPlayer.uid}_${currentUser.uid}`;
  const reverseSnap = await getDoc(getRef('request', reverseReqId, mode)).catch(() => null);
  if (reverseSnap && reverseSnap.exists()) {
    const revData = reverseSnap.data() as FriendRequest & { _deleted?: boolean };
    if (!revData._deleted && revData.status === 'pending') {
      throw new Error('هذا اللاعب أرسل لك طلب صداقة بالفعل، يمكنك قبوله من قائمة الطلبات الواردة');
    }
  }

  const reqId = `${currentUser.uid}_${targetPlayer.uid}`;
  const reqDocRef = getRef('request', reqId, mode);
  const existingReqSnap = await getDoc(reqDocRef).catch(() => null);
  const now = Date.now();
  const myName = getDisplayName(currentUser);

  if (existingReqSnap && existingReqSnap.exists()) {
    const prev = existingReqSnap.data() as FriendRequest & { _deleted?: boolean };
    if (!prev._deleted && prev.status === 'pending') {
      throw new Error('تم إرسال طلب صداقة لهذا اللاعب مسبقاً وهو بانتظار الرد');
    }
  }

  const reqPayload: FriendRequest = {
    id: reqId,
    fromUid: currentUser.uid,
    fromName: myName,
    fromPhotoURL: currentUser.photoURL || '',
    toUid: targetPlayer.uid,
    toName: targetPlayer.displayName || 'لاعب نِزال',
    toPhotoURL: targetPlayer.photoURL || '',
    status: 'pending',
    createdAt:
      existingReqSnap && existingReqSnap.exists()
        ? (existingReqSnap.data() as FriendRequest).createdAt || now
        : now,
    updatedAt: now,
  };

  const notifId = `notif_fr_${reqId}_${now}`;
  const notifPayload: UserNotification = {
    id: notifId,
    userId: targetPlayer.uid,
    actorUid: currentUser.uid,
    actorName: myName,
    type: 'friend_request',
    title: 'طلب صداقة جديد',
    message: `أرسل لك ${myName} طلب صداقة`,
    relatedId: reqId,
    isRead: false,
    createdAt: now,
  };

  const batch = writeBatch(db);
  if (mode === 'native') {
    if (existingReqSnap && existingReqSnap.exists()) {
      batch.update(reqDocRef, {
        fromName: reqPayload.fromName,
        fromPhotoURL: reqPayload.fromPhotoURL,
        toName: reqPayload.toName,
        toPhotoURL: reqPayload.toPhotoURL,
        status: 'pending',
        updatedAt: now,
      });
    } else {
      batch.set(reqDocRef, reqPayload);
    }
    batch.set(getRef('notification', notifId, 'native'), notifPayload);
  } else {
    batch.set(reqDocRef, {
      ...reqPayload,
      socialDocType: 'friendRequest',
      socialReqFromUid: reqPayload.fromUid,
      socialReqToUid: reqPayload.toUid,
      _deleted: false,
    });
    const { userId: _omit, ...notifRest } = notifPayload;
    batch.set(getRef('notification', notifId, 'fallback'), {
      ...notifRest,
      socialDocType: 'notification',
      socialNotifUserId: notifPayload.userId,
      _deleted: false,
    });
  }
  await batch.commit();
}

export async function acceptFriendRequest(
  currentUser: User,
  request: FriendRequest
): Promise<void> {
  if (!currentUser?.uid) throw new Error('يجب تسجيل الدخول أولاً');
  if (request.toUid !== currentUser.uid) {
    throw new Error('لا تملك صلاحية قبول هذا الطلب');
  }
  if (request.status !== 'pending') {
    throw new Error('هذا الطلب لم يعد معلقاً');
  }

  const mode = await ensureSocialStoreMode(currentUser.uid);

  const blockState = await isBlockedBetween(currentUser.uid, request.fromUid);
  if (blockState.blockedByMe || blockState.blockedMe) {
    throw new Error('لا يمكن إتمام الصداقة بسبب وجود حظر بين الحسابين');
  }

  const { pairId, user1, user2 } = getSortedPairId(request.fromUid, request.toUid);
  const myName = getDisplayName(currentUser);
  const myPhoto = currentUser.photoURL || '';
  const now = Date.now();

  const isCurrentUser1 = user1 === currentUser.uid;
  const friendshipPayload: Friendship = {
    id: pairId,
    user1,
    user2,
    user1Name: isCurrentUser1 ? myName : request.fromName || 'لاعب نِزال',
    user1PhotoURL: isCurrentUser1 ? myPhoto : request.fromPhotoURL || '',
    user2Name: isCurrentUser1 ? request.fromName || 'لاعب نِزال' : myName,
    user2PhotoURL: isCurrentUser1 ? request.fromPhotoURL || '' : myPhoto,
    requestId: request.id,
    createdBy: currentUser.uid,
    createdAt: now,
  };

  const notifId = `notif_fa_${pairId}_${now}`;
  const notifPayload: UserNotification = {
    id: notifId,
    userId: request.fromUid,
    actorUid: currentUser.uid,
    actorName: myName,
    type: 'friend_accepted',
    title: 'تم قبول طلب الصداقة',
    message: `قبل ${myName} طلب صداقتك! أصبحتما أصدقاء الآن`,
    relatedId: pairId,
    isRead: false,
    createdAt: now,
  };

  const batch = writeBatch(db);
  batch.update(getRef('request', request.id, mode), {
    status: 'accepted',
    toName: myName,
    toPhotoURL: myPhoto,
    updatedAt: now,
  });

  if (mode === 'native') {
    batch.set(getRef('friendship', pairId, 'native'), friendshipPayload);
    batch.set(getRef('notification', notifId, 'native'), notifPayload);
  } else {
    batch.set(getRef('friendship', pairId, 'fallback'), {
      ...friendshipPayload,
      socialDocType: 'friendship',
      socialFriendUsers: [user1, user2],
      _deleted: false,
    });
    const { userId: _omit, ...notifRest } = notifPayload;
    batch.set(getRef('notification', notifId, 'fallback'), {
      ...notifRest,
      socialDocType: 'notification',
      socialNotifUserId: notifPayload.userId,
      _deleted: false,
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('social', err);
      throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
    }
    const altMode = mode === 'native' ? 'fallback' : 'native';
    const altReqSnap = await getDoc(getRef('request', request.id, altMode)).catch(() => null);
    if (altReqSnap && altReqSnap.exists() && !(altReqSnap.data() as { _deleted?: boolean })?._deleted) {
      const altBatch = writeBatch(db);
      altBatch.update(getRef('request', request.id, altMode), {
        status: 'accepted',
        toName: myName,
        toPhotoURL: myPhoto,
        updatedAt: now,
      });
      if (altMode === 'native') {
        altBatch.set(getRef('friendship', pairId, 'native'), friendshipPayload);
        altBatch.set(getRef('notification', notifId, 'native'), notifPayload);
      } else {
        altBatch.set(getRef('friendship', pairId, 'fallback'), {
          ...friendshipPayload,
          socialDocType: 'friendship',
          socialFriendUsers: [user1, user2],
          _deleted: false,
        });
        const { userId: _omit, ...notifRest } = notifPayload;
        altBatch.set(getRef('notification', notifId, 'fallback'), {
          ...notifRest,
          socialDocType: 'notification',
          socialNotifUserId: notifPayload.userId,
          _deleted: false,
        });
      }
      await altBatch.commit();
      return;
    }
    logSocialTrace('acceptFriendRequest', {
      storeMode: mode,
      code: classifySocialErrorCode(err),
      reason: 'commit_failed',
    });
    throw new Error(formatSocialErrorMessage(err, 'تعذر قبول طلب الصداقة.'));
  }
}

export async function rejectFriendRequest(
  currentUser: User,
  request: FriendRequest
): Promise<void> {
  if (!currentUser?.uid || request.toUid !== currentUser.uid) {
    throw new Error('لا تملك صلاحية رفض هذا الطلب');
  }
  const mode = await ensureSocialStoreMode(currentUser.uid);
  try {
    await updateDoc(getRef('request', request.id, mode), {
      status: 'rejected',
      updatedAt: Date.now(),
    });
  } catch (err) {
    const altMode = mode === 'native' ? 'fallback' : 'native';
    try {
      await updateDoc(getRef('request', request.id, altMode), {
        status: 'rejected',
        updatedAt: Date.now(),
      });
    } catch {
      logSocialTrace('rejectFriendRequest', {
        storeMode: mode,
        code: classifySocialErrorCode(err),
        reason: 'update_failed',
      });
      throw new Error(formatSocialErrorMessage(err, 'تعذر رفض طلب الصداقة.'));
    }
  }
}

export async function cancelFriendRequest(
  currentUser: User,
  request: FriendRequest
): Promise<void> {
  if (!currentUser?.uid || request.fromUid !== currentUser.uid) {
    throw new Error('لا تملك صلاحية إلغاء هذا الطلب');
  }
  const mode = await ensureSocialStoreMode(currentUser.uid);
  await updateDoc(getRef('request', request.id, mode), {
    status: 'cancelled',
    updatedAt: Date.now(),
  });
}

export async function removeFriend(currentUser: User, friendUid: string): Promise<void> {
  if (!currentUser?.uid) return;
  const mode = await ensureSocialStoreMode(currentUser.uid);
  const { pairId } = getSortedPairId(currentUser.uid, friendUid);
  const now = Date.now();

  const batch = writeBatch(db);
  const fRef = getRef('friendship', pairId, mode);
  if (mode === 'native') {
    batch.delete(fRef);
  } else {
    batch.set(
      fRef,
      { _deleted: true, socialFriendUsers: [], updatedAt: now },
      { merge: true }
    );
  }

  // Reset any accepted friend requests between both users so they can re-add in the future if desired
  const [req1, req2] = await Promise.all([
    getDoc(getRef('request', `${currentUser.uid}_${friendUid}`, mode)).catch(() => null),
    getDoc(getRef('request', `${friendUid}_${currentUser.uid}`, mode)).catch(() => null),
  ]);

  if (req1 && req1.exists() && (req1.data() as FriendRequest).status === 'accepted') {
    batch.update(req1.ref, { status: 'cancelled', updatedAt: now });
  }
  if (req2 && req2.exists() && (req2.data() as FriendRequest).status === 'accepted') {
    batch.update(req2.ref, { status: 'cancelled', updatedAt: now });
  }

  await batch.commit();
}

export function subscribeToFriendships(
  uid: string,
  onUpdate: (friendships: Friendship[]) => void
): () => void {
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('social', 'dedup_skip', 1, 'quota_paused_friendships');
    return () => {};
  }
  let disposed = false;
  let unsubs: (() => void)[] = [];

  const attach = (mode: 'native' | 'fallback') => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (disposed || isFirestoreQuotaPaused()) return;

    if (mode === 'native') {
      let list1: Friendship[] = [];
      let list2: Friendship[] = [];
      const emit = () => {
        const map = new Map<string, Friendship>();
        [...list1, ...list2].forEach((f) => map.set(f.id, f));
        onUpdate(Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt));
      };

      const q1 = query(collection(db, FRIENDSHIPS_COL), where('user1', '==', uid));
      const q2 = query(collection(db, FRIENDSHIPS_COL), where('user2', '==', uid));

      unsubs.push(
        onSnapshot(
          q1,
          (snap) => {
            list1 = snap.docs.map((d) => d.data() as Friendship);
            emit();
          },
          (err) => {
            if (isFirestoreQuotaExceededError(err)) {
              triggerFirestoreQuotaCooldown('social', err);
              return;
            }
            if (isPermissionDeniedError(err)) {
              enableFallbackSocialStore();
              attach('fallback');
            } else {
              console.warn('Error subscribing to friendships (q1):', err);
            }
          }
        )
      );
      unsubs.push(
        onSnapshot(
          q2,
          (snap) => {
            list2 = snap.docs.map((d) => d.data() as Friendship);
            emit();
          },
          (err) => {
            if (isFirestoreQuotaExceededError(err)) {
              triggerFirestoreQuotaCooldown('social', err);
              return;
            }
            if (isPermissionDeniedError(err)) {
              enableFallbackSocialStore();
              attach('fallback');
            } else {
              console.warn('Error subscribing to friendships (q2):', err);
            }
          }
        )
      );
    } else {
      const qF = query(
        collection(db, SOCIAL_FALLBACK_COLLECTION),
        where('socialFriendUsers', 'array-contains', uid)
      );
      unsubs.push(
        onSnapshot(
          qF,
          (snap) => {
            const list = snap.docs
              .map((d) => d.data() as Friendship & { _deleted?: boolean; socialDocType?: string })
              .filter((f) => !f._deleted && f.socialDocType === 'friendship')
              .sort((a, b) => b.createdAt - a.createdAt);
            onUpdate(list);
          },
          (err) => {
            if (isFirestoreQuotaExceededError(err)) {
              triggerFirestoreQuotaCooldown('social', err);
              return;
            }
            console.warn('Error subscribing to fallback friendships:', err);
          }
        )
      );
    }
  };

  const unsubQuota = subscribeFirestoreQuotaState((state) => {
    if (state.paused) {
      unsubs.forEach((u) => u());
      unsubs = [];
    }
  });

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
    unsubQuota();
    unsubs.forEach((u) => u());
  };
}

export type SubscriptionDirection = 'incoming' | 'outgoing' | 'both';

export function subscribeToFriendRequests(
  uid: string,
  onUpdate: (data: { incoming: FriendRequest[]; outgoing: FriendRequest[] }) => void,
  direction: SubscriptionDirection = 'both'
): () => void {
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('social', 'dedup_skip', 1, 'quota_paused_friend_requests');
    return () => {};
  }
  let disposed = false;
  let unsubs: (() => void)[] = [];

  const attach = (mode: 'native' | 'fallback') => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (disposed || isFirestoreQuotaPaused()) return;

    let incoming: FriendRequest[] = [];
    let outgoing: FriendRequest[] = [];
    const emit = () => onUpdate({ incoming, outgoing });

    if (direction === 'incoming' || direction === 'both') {
      const qIn =
        mode === 'native'
          ? query(collection(db, REQUESTS_COL), where('toUid', '==', uid))
          : query(collection(db, SOCIAL_FALLBACK_COLLECTION), where('socialReqToUid', '==', uid));

      unsubs.push(
        onSnapshot(
          qIn,
          (snap) => {
            incoming = snap.docs
              .map((d) => d.data() as FriendRequest & { _deleted?: boolean })
              .filter((r) => !r._deleted && r.status === 'pending')
              .sort((a, b) => b.updatedAt - a.updatedAt);
            emit();
          },
          (err) => {
            if (isFirestoreQuotaExceededError(err)) {
              triggerFirestoreQuotaCooldown('social', err);
              return;
            }
            if (mode === 'native' && isPermissionDeniedError(err)) {
              enableFallbackSocialStore();
              attach('fallback');
            }
          }
        )
      );
    }

    if (direction === 'outgoing' || direction === 'both') {
      const qOut =
        mode === 'native'
          ? query(collection(db, REQUESTS_COL), where('fromUid', '==', uid))
          : query(collection(db, SOCIAL_FALLBACK_COLLECTION), where('socialReqFromUid', '==', uid));

      unsubs.push(
        onSnapshot(
          qOut,
          (snap) => {
            outgoing = snap.docs
              .map((d) => d.data() as FriendRequest & { _deleted?: boolean })
              .filter((r) => !r._deleted && r.status === 'pending')
              .sort((a, b) => b.updatedAt - a.updatedAt);
            emit();
          },
          (err) => {
            if (isFirestoreQuotaExceededError(err)) {
              triggerFirestoreQuotaCooldown('social', err);
              return;
            }
            if (mode === 'native' && isPermissionDeniedError(err)) {
              enableFallbackSocialStore();
              attach('fallback');
            }
          }
        )
      );
    }
  };

  const unsubQuota = subscribeFirestoreQuotaState((state) => {
    if (state.paused) {
      unsubs.forEach((u) => u());
      unsubs = [];
    }
  });

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
    unsubQuota();
    unsubs.forEach((u) => u());
  };
}

// =========================================================================
// 3. BLOCKING & PRIVACY PREFERENCES
// =========================================================================
export async function blockUser(
  currentUser: User,
  targetUid: string,
  targetName?: string,
  targetPhotoURL?: string
): Promise<void> {
  if (!currentUser?.uid) throw new Error('يجب تسجيل الدخول أولاً');
  if (!targetUid || targetUid === currentUser.uid) {
    throw new Error('لا يمكنك حظر نفسك');
  }

  const mode = await ensureSocialStoreMode(currentUser.uid);
  const now = Date.now();
  const blockId = `${currentUser.uid}_${targetUid}`;
  const { pairId } = getSortedPairId(currentUser.uid, targetUid);

  const batch = writeBatch(db);
  const blockPayload: UserBlock = {
    id: blockId,
    blockerUid: currentUser.uid,
    blockedUid: targetUid,
    blockedName: targetName || 'مستخدم',
    blockedPhotoURL: targetPhotoURL || '',
    createdAt: now,
  };

  if (mode === 'native') {
    batch.set(getRef('block', blockId, 'native'), blockPayload);
  } else {
    batch.set(getRef('block', blockId, 'fallback'), {
      ...blockPayload,
      socialDocType: 'userBlock',
      socialBlockOwnerUid: currentUser.uid,
      _deleted: false,
    });
  }

  // Clean up any friendship and requests between them
  const [friendSnap, reqOut, reqIn] = await Promise.all([
    getDoc(getRef('friendship', pairId, mode)).catch(() => null),
    getDoc(getRef('request', `${currentUser.uid}_${targetUid}`, mode)).catch(() => null),
    getDoc(getRef('request', `${targetUid}_${currentUser.uid}`, mode)).catch(() => null),
  ]);

  if (friendSnap && friendSnap.exists()) {
    if (mode === 'native') {
      batch.delete(friendSnap.ref);
    } else {
      batch.set(
        friendSnap.ref,
        { _deleted: true, socialFriendUsers: [], updatedAt: now },
        { merge: true }
      );
    }
  }
  if (reqOut && reqOut.exists() && (reqOut.data() as FriendRequest).status === 'pending') {
    batch.update(reqOut.ref, { status: 'cancelled', updatedAt: now });
  }
  if (reqIn && reqIn.exists() && (reqIn.data() as FriendRequest).status === 'pending') {
    batch.update(reqIn.ref, { status: 'rejected', updatedAt: now });
  }

  // Cancel any pending invites sent to/from blocked user (single-field queries avoid composite index requirements)
  const [invOut, invIn] = await Promise.all([
    getDocs(
      mode === 'native'
        ? query(
            collection(db, INVITES_COL),
            where('fromUid', '==', currentUser.uid),
            where('toUid', '==', targetUid)
          )
        : query(
            collection(db, SOCIAL_FALLBACK_COLLECTION),
            where('socialInvFromUid', '==', currentUser.uid)
          )
    ).catch(() => null),
    getDocs(
      mode === 'native'
        ? query(
            collection(db, INVITES_COL),
            where('fromUid', '==', targetUid),
            where('toUid', '==', currentUser.uid)
          )
        : query(
            collection(db, SOCIAL_FALLBACK_COLLECTION),
            where('socialInvToUid', '==', currentUser.uid)
          )
    ).catch(() => null),
  ]);

  invOut?.forEach((d) => {
    const inv = d.data() as GameInvite & { _deleted?: boolean };
    if (!inv._deleted && inv.toUid === targetUid && inv.status === 'pending') {
      batch.update(d.ref, { status: 'cancelled', updatedAt: now });
    }
  });
  invIn?.forEach((d) => {
    const inv = d.data() as GameInvite & { _deleted?: boolean };
    if (!inv._deleted && inv.fromUid === targetUid && inv.status === 'pending') {
      batch.update(d.ref, { status: 'rejected', updatedAt: now });
    }
  });

  await batch.commit();
}

export async function unblockUser(currentUser: User, targetUid: string): Promise<void> {
  if (!currentUser?.uid) return;
  const mode = await ensureSocialStoreMode(currentUser.uid);
  const bRef = getRef('block', `${currentUser.uid}_${targetUid}`, mode);
  if (mode === 'native') {
    await deleteDoc(bRef);
  } else {
    await updateDoc(bRef, { _deleted: true, updatedAt: Date.now() });
  }
}

export function subscribeToBlockedUsers(
  uid: string,
  onUpdate: (blocks: UserBlock[]) => void
): () => void {
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('social', 'dedup_skip', 1, 'quota_paused_blocks');
    return () => {};
  }
  let disposed = false;
  let unsub: (() => void) | null = null;

  const attach = (mode: 'native' | 'fallback') => {
    unsub?.();
    if (disposed || isFirestoreQuotaPaused()) return;

    const q =
      mode === 'native'
        ? query(collection(db, BLOCKS_COL), where('blockerUid', '==', uid))
        : query(
            collection(db, SOCIAL_FALLBACK_COLLECTION),
            where('socialBlockOwnerUid', '==', uid)
          );
    unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as UserBlock & { _deleted?: boolean })
          .filter((b) => !b._deleted)
          .sort((a, b) => b.createdAt - a.createdAt);
        onUpdate(list);
      },
      (err) => {
        if (isFirestoreQuotaExceededError(err)) {
          triggerFirestoreQuotaCooldown('social', err);
          return;
        }
        if (mode === 'native' && isPermissionDeniedError(err)) {
          enableFallbackSocialStore();
          attach('fallback');
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

export async function updateAcceptsInvitesSetting(
  uid: string,
  acceptsInvites: boolean
): Promise<void> {
  const mode = await ensureSocialStoreMode(uid);
  await updateDoc(getRef('profile', uid, mode), {
    acceptsInvites,
    updatedAt: Date.now(),
  });
  setCachedAcceptsInvitesPreference(uid, acceptsInvites);
}

// =========================================================================
// 4. PLAY & SPECTATOR INVITES
// =========================================================================
export async function sendGameInvite(params: {
  fromUser: User;
  toPlayer: { uid: string; displayName?: string };
  roomCode: string;
  inviteType: GameInviteType;
  roomSnapshot?: OnlineGameRoom | null;
}): Promise<GameInvite> {
  const { fromUser, toPlayer, inviteType, roomSnapshot } = params;
  const cleanCode = params.roomCode.trim().toUpperCase();

  if (!fromUser?.uid) throw new Error('يجب تسجيل الدخول أولاً لإرسال الدعوات.');
  if (!toPlayer?.uid || toPlayer.uid === fromUser.uid) {
    throw new Error('لا يمكنك إرسال دعوة إلى نفسك.');
  }
  if (!cleanCode || cleanCode.length < 4) {
    throw new Error('رمز الغرفة غير صالح.');
  }
  if (isFirestoreQuotaPaused()) {
    throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
  }

  let activeMode = await ensureSocialStoreMode(fromUser.uid);

  const safeReadDoc = async (
    kind: 'profile' | 'friendship' | 'invite',
    id: string
  ) => {
    try {
      return await getDoc(getRef(kind, id, activeMode));
    } catch (err) {
      if (isFirestoreQuotaExceededError(err)) {
        triggerFirestoreQuotaCooldown('social', err);
        throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
      }
      if (activeMode === 'native' && isPermissionDeniedError(err)) {
        enableFallbackSocialStore();
        activeMode = 'fallback';
        return await getDoc(getRef(kind, id, 'fallback')).catch((fbErr) => {
          if (isFirestoreQuotaExceededError(fbErr)) {
            triggerFirestoreQuotaCooldown('social', fbErr);
            throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
          }
          throw new Error(formatSocialErrorMessage(fbErr, 'تعذر قراءة بيانات الدعوة.'));
        });
      }
      throw new Error(formatSocialErrorMessage(err, 'تعذر الوصول إلى بيانات قاعدة البيانات.'));
    }
  };

  // Verify friendship (check active store; if native has no record yet, also recognize legacy fallback friendship
  // WITHOUT switching activeMode to fallback so invites & notifications always land in native store!)
  const { pairId } = getSortedPairId(fromUser.uid, toPlayer.uid);
  let friendSnap = await safeReadDoc('friendship', pairId);
  if (!friendSnap.exists() || (friendSnap.data() as { _deleted?: boolean })?._deleted) {
    const altMode: 'native' | 'fallback' = activeMode === 'native' ? 'fallback' : 'native';
    const altFriendSnap = await getDoc(getRef('friendship', pairId, altMode)).catch((err) => {
      if (isFirestoreQuotaExceededError(err)) {
        triggerFirestoreQuotaCooldown('social', err);
        throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
      }
      return null;
    });
    if (
      altFriendSnap &&
      altFriendSnap.exists() &&
      !(altFriendSnap.data() as { _deleted?: boolean })?._deleted
    ) {
      friendSnap = altFriendSnap;
    }
  }

  if (
    !friendSnap ||
    !friendSnap.exists() ||
    (friendSnap.data() as { _deleted?: boolean })?._deleted
  ) {
    logSocialTrace('sendGameInvite', {
      storeMode: activeMode,
      code: 'social/not-friends',
      reason: 'missing_friendship',
      inviteType,
      hasRoomCode: true,
    });
    throw new Error('يمكنك إرسال الدعوات للأصدقاء فقط.');
  }

  // Verify not blocked
  const blockState = await isBlockedBetween(fromUser.uid, toPlayer.uid);
  if (blockState.blockedByMe || blockState.blockedMe) {
    throw new Error('تعذر إرسال الدعوة بسبب إعدادات الحظر بين الحسابين.');
  }

  // Verify recipient invite settings
  const targetProfileSnap = await safeReadDoc('profile', toPlayer.uid).catch((err) => {
    if (isFirestoreQuotaExceededError(err)) {
      throw err;
    }
    return null;
  });
  if (targetProfileSnap && targetProfileSnap.exists()) {
    const profile = targetProfileSnap.data() as PlayerProfile;
    if (profile.acceptsInvites === false) {
      throw new Error('أوقف هذا الصديق استقبال دعوات اللعب والمشاهدة.');
    }
  }

  // Verify room exists and is open (prefer live roomSnapshot when caller is already inside the room)
  let room: OnlineGameRoom | null =
    roomSnapshot && roomSnapshot.code?.trim().toUpperCase() === cleanCode
      ? roomSnapshot
      : null;

  if (!room) {
    try {
      room = await fetchOnlineRoom(cleanCode);
    } catch (err) {
      logSocialTrace('sendGameInvite', {
        storeMode: activeMode,
        code: classifySocialErrorCode(err),
        reason: 'room_fetch_failed',
        inviteType,
        hasRoomCode: true,
      });
      throw new Error(formatSocialErrorMessage(err, 'تعذر التحقق من حالة الغرفة قبل إرسال الدعوة.'));
    }
  }

  if (!room) {
    throw new Error('الغرفة غير موجودة أو تم إغلاقها.');
  }
  if (room.status === 'finished' || room.status === 'completed') {
    throw new Error('المباراة في هذه الغرفة قد انتهت بالفعل.');
  }
  if (inviteType === 'play') {
    const playerCount = Object.keys(room.players || {}).length;
    const currentGuestUid = room.guestUid || room.guestId || null;
    const isTargetAlreadyInRoom =
      (room.hostUid || room.hostId) === toPlayer.uid ||
      currentGuestUid === toPlayer.uid ||
      Boolean(room.players?.[toPlayer.uid]);

    if (!isTargetAlreadyInRoom) {
      if (currentGuestUid && currentGuestUid !== toPlayer.uid) {
        throw new Error('الغرفة مكتملة بالفعل بوجود مضيف وضيف، يمكنك إرسال دعوة للمشاهدة بدلاً من ذلك.');
      }
      if (playerCount >= (room.maxPlayers || 2)) {
        throw new Error('الغرفة ممتلئة حالياً، يمكنك إرسال دعوة للمشاهدة بدلاً من ذلك.');
      }
      if (room.status === 'playing' || room.status === 'in_game') {
        throw new Error('المباراة بدأت بالفعل، يمكنك إرسال دعوة للمشاهدة بدلاً من ذلك.');
      }
    }
  }

  const now = Date.now();
  const inviteId = `${fromUser.uid}_${toPlayer.uid}_${cleanCode}_${inviteType}`;
  const existingInviteSnap = await safeReadDoc('invite', inviteId);

  if (existingInviteSnap && existingInviteSnap.exists()) {
    const prev = existingInviteSnap.data() as GameInvite & { _deleted?: boolean };
    if (!prev._deleted && prev.status === 'pending' && prev.expiresAt > now) {
      throw new Error('توجد دعوة نشطة مرسلة بالفعل لهذا الصديق في نفس الغرفة.');
    }
  }

  const myName = getDisplayName(fromUser);
  const expiresAt = now + INVITE_TTL_MS;

  const invitePayload: GameInvite = {
    id: inviteId,
    fromUid: fromUser.uid,
    fromName: myName,
    fromPhotoURL: fromUser.photoURL || '',
    toUid: toPlayer.uid,
    toName: toPlayer.displayName || 'صديق',
    roomCode: cleanCode,
    inviteType,
    status: 'pending',
    createdAt: now,
    expiresAt,
    updatedAt: now,
  };

  const randSuffix = Math.random().toString(36).slice(2, 6);
  const notifId = `notif_inv_${cleanCode}_${now}_${randSuffix}`;
  const isPlay = inviteType === 'play';
  const notifPayload: UserNotification = {
    id: notifId,
    userId: toPlayer.uid,
    actorUid: fromUser.uid,
    actorName: myName,
    type: isPlay ? 'play_invite' : 'spectate_invite',
    title: isPlay ? 'دعوة للعب أونلاين' : 'دعوة لمشاهدة مباراة',
    message: isPlay
      ? `يدعوك ${myName} للعب في الغرفة ${cleanCode}`
      : `يدعوك ${myName} لمشاهدة المباراة في الغرفة ${cleanCode}`,
    relatedId: inviteId,
    roomCode: cleanCode,
    inviteType,
    isRead: false,
    createdAt: now,
    expiresAt,
  };

  const commitBatch = async (
    targetMode: 'native' | 'fallback',
    hasExistingNativeDoc: boolean
  ) => {
    const batch = writeBatch(db);
    const targetInvRef = getRef('invite', inviteId, targetMode);
    if (targetMode === 'native') {
      if (hasExistingNativeDoc) {
        batch.update(targetInvRef, {
          fromName: myName,
          fromPhotoURL: fromUser.photoURL || '',
          toName: invitePayload.toName,
          status: 'pending',
          createdAt: now,
          expiresAt,
          updatedAt: now,
        });
      } else {
        batch.set(targetInvRef, invitePayload);
      }
      batch.set(getRef('notification', notifId, 'native'), notifPayload);
    } else {
      batch.set(targetInvRef, {
        ...invitePayload,
        socialDocType: 'gameInvite',
        socialInvFromUid: invitePayload.fromUid,
        socialInvToUid: invitePayload.toUid,
        _deleted: false,
      });
      const { userId: _omit, ...notifRest } = notifPayload;
      batch.set(getRef('notification', notifId, 'fallback'), {
        ...notifRest,
        socialDocType: 'notification',
        socialNotifUserId: notifPayload.userId,
        _deleted: false,
      });
    }
    await batch.commit();
  };

  try {
    await commitBatch(
      activeMode,
      Boolean(existingInviteSnap && existingInviteSnap.exists())
    );
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('social', err);
      logSocialTrace('sendGameInvite', {
        storeMode: activeMode,
        code: 'firestore/quota-exceeded',
        reason: 'batch_quota_exceeded',
        inviteType,
        hasRoomCode: true,
      });
      throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
    }
    if (activeMode === 'native' && isPermissionDeniedError(err)) {
      logSocialTrace('sendGameInvite', {
        storeMode: 'native',
        code: 'firestore/permission-denied',
        reason: 'native_write_denied_trying_fallback',
        inviteType,
        hasRoomCode: true,
      });
      enableFallbackSocialStore();
      try {
        await commitBatch('fallback', false);
        return invitePayload;
      } catch (fbErr) {
        if (isFirestoreQuotaExceededError(fbErr)) {
          triggerFirestoreQuotaCooldown('social', fbErr);
          throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
        }
        logSocialTrace('sendGameInvite', {
          storeMode: 'fallback',
          code: classifySocialErrorCode(fbErr),
          reason: 'fallback_write_failed',
          inviteType,
          hasRoomCode: true,
        });
        throw new Error(
          formatSocialErrorMessage(fbErr, 'تعذر حفظ الدعوة في قاعدة البيانات.')
        );
      }
    }
    logSocialTrace('sendGameInvite', {
      storeMode: activeMode,
      code: classifySocialErrorCode(err),
      reason: 'batch_commit_failed',
      inviteType,
      hasRoomCode: true,
    });
    throw new Error(
      formatSocialErrorMessage(err, 'تعذر إرسال الدعوة حالياً. يرجى المحاولة مجدداً.')
    );
  }

  return invitePayload;
}

export async function acceptGameInvite(
  currentUser: User,
  invite: GameInvite
): Promise<{ roomCode: string; inviteType: GameInviteType }> {
  if (!currentUser?.uid || invite.toUid !== currentUser.uid) {
    throw new Error('لا تملك صلاحية قبول هذه الدعوة.');
  }
  if (invite.status !== 'pending') {
    throw new Error('هذه الدعوة لم تعد صالحة أو تم الرد عليها مسبقاً.');
  }
  if (isFirestoreQuotaPaused()) {
    throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
  }

  const activeMode = await ensureSocialStoreMode(currentUser.uid);
  const altMode: 'native' | 'fallback' = activeMode === 'native' ? 'fallback' : 'native';
  const now = Date.now();
  const invDocRef = getRef('invite', invite.id, activeMode);

  const updateInviteStatusCrossStore = async (payload: Record<string, unknown>) => {
    try {
      await updateDoc(invDocRef, payload);
    } catch (err) {
      if (isFirestoreQuotaExceededError(err)) {
        triggerFirestoreQuotaCooldown('social', err);
        throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
      }
      // Try alternate store in case invite was written there without poisoning global mode
      try {
        await updateDoc(getRef('invite', invite.id, altMode), payload);
      } catch (altErr) {
        if (isFirestoreQuotaExceededError(altErr)) {
          triggerFirestoreQuotaCooldown('social', altErr);
          throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
        }
        logSocialTrace('acceptGameInvite', {
          storeMode: activeMode,
          code: classifySocialErrorCode(err),
          reason: 'invite_status_update_failed',
          inviteType: invite.inviteType,
          hasRoomCode: Boolean(invite.roomCode),
        });
        throw err;
      }
    }
  };

  if (invite.expiresAt && now > invite.expiresAt) {
    await updateInviteStatusCrossStore({ status: 'expired', updatedAt: now }).catch(() => {});
    throw new Error('انتهت صلاحية هذه الدعوة.');
  }

  let room: OnlineGameRoom | null = null;
  try {
    room = await fetchOnlineRoom(invite.roomCode);
  } catch (err) {
    logSocialTrace('acceptGameInvite', {
      storeMode: activeMode,
      code: classifySocialErrorCode(err),
      reason: 'room_fetch_failed',
      inviteType: invite.inviteType,
      hasRoomCode: Boolean(invite.roomCode),
    });
    throw new Error(formatSocialErrorMessage(err, 'تعذر التحقق من الغرفة.'));
  }

  if (!room) {
    await updateInviteStatusCrossStore({ status: 'expired', updatedAt: now }).catch(() => {});
    throw new Error('الغرفة غير موجودة أو تم إغلاقها.');
  }
  if (room.status === 'finished' || room.status === 'completed') {
    await updateInviteStatusCrossStore({ status: 'expired', updatedAt: now }).catch(() => {});
    throw new Error('المباراة في هذه الغرفة قد انتهت بالفعل.');
  }

  if (invite.inviteType === 'play') {
    const playersCount = Object.keys(room.players || {}).length;
    const currentGuestUid = room.guestUid || room.guestId || null;
    const isAlreadyInRoom =
      (room.hostUid || room.hostId) === currentUser.uid ||
      currentGuestUid === currentUser.uid ||
      Boolean(room.players?.[currentUser.uid]);
    if (!isAlreadyInRoom) {
      if (currentGuestUid && currentGuestUid !== currentUser.uid) {
        throw new Error('الغرفة مكتملة حالياً بوجود مضيف وضيف. يمكنك الدخول كمشاهد بدلاً من ذلك.');
      }
      if (playersCount >= (room.maxPlayers || 2)) {
        throw new Error('الغرفة ممتلئة حالياً.');
      }
      if (room.status === 'playing' || room.status === 'in_game') {
        throw new Error('بدأت المباراة بالفعل في هذه الغرفة، يمكنك الانضمام كمشاهد بدلاً من ذلك.');
      }
    }
  }

  try {
    await updateInviteStatusCrossStore({
      status: 'accepted',
      updatedAt: now,
    });
  } catch (err) {
    throw new Error(formatSocialErrorMessage(err, 'تعذر قبول الدعوة.'));
  }

  return {
    roomCode: invite.roomCode,
    inviteType: invite.inviteType,
  };
}

export async function rejectGameInvite(
  currentUser: User,
  invite: GameInvite
): Promise<void> {
  if (!currentUser?.uid || invite.toUid !== currentUser.uid) {
    throw new Error('لا تملك صلاحية رفض هذه الدعوة.');
  }
  const mode = await ensureSocialStoreMode(currentUser.uid);
  const altMode: 'native' | 'fallback' = mode === 'native' ? 'fallback' : 'native';
  try {
    await updateDoc(getRef('invite', invite.id, mode), {
      status: 'rejected',
      updatedAt: Date.now(),
    });
  } catch (err) {
    try {
      await updateDoc(getRef('invite', invite.id, altMode), {
        status: 'rejected',
        updatedAt: Date.now(),
      });
    } catch {
      logSocialTrace('rejectGameInvite', {
        storeMode: mode,
        code: classifySocialErrorCode(err),
        reason: 'reject_update_failed',
        inviteType: invite.inviteType,
      });
      throw new Error(formatSocialErrorMessage(err, 'تعذر رفض الدعوة.'));
    }
  }
}

export async function cancelGameInvite(
  currentUser: User,
  invite: GameInvite
): Promise<void> {
  if (!currentUser?.uid || invite.fromUid !== currentUser.uid) {
    throw new Error('لا تملك صلاحية إلغاء هذه الدعوة');
  }
  const mode = await ensureSocialStoreMode(currentUser.uid);
  const now = Date.now();
  const myName = getDisplayName(currentUser);
  const batch = writeBatch(db);
  batch.update(getRef('invite', invite.id, mode), {
    status: 'cancelled',
    updatedAt: now,
  });

  const blockState = await isBlockedBetween(currentUser.uid, invite.toUid).catch(() => ({
    blockedByMe: false,
    blockedMe: false,
  }));
  if (!blockState.blockedByMe && !blockState.blockedMe) {
    const notifId = `notif_ic_${invite.id}_${now}`;
    const notifPayload: UserNotification = {
      id: notifId,
      userId: invite.toUid,
      actorUid: currentUser.uid,
      actorName: myName,
      type: 'invite_cancelled',
      title: 'تم إلغاء الدعوة',
      message: `ألغى ${myName} دعوة الغرفة ${invite.roomCode}`,
      relatedId: invite.id,
      roomCode: invite.roomCode,
      inviteType: invite.inviteType,
      isRead: false,
      createdAt: now,
    };
    if (mode === 'native') {
      batch.set(getRef('notification', notifId, 'native'), notifPayload);
    } else {
      const { userId: _omit, ...notifRest } = notifPayload;
      batch.set(getRef('notification', notifId, 'fallback'), {
        ...notifRest,
        socialDocType: 'notification',
        socialNotifUserId: notifPayload.userId,
        _deleted: false,
      });
    }
  }
  await batch.commit();
}

export function subscribeToGameInvites(
  uid: string,
  onUpdate: (data: { incoming: GameInvite[]; outgoing: GameInvite[] }) => void,
  direction: SubscriptionDirection = 'both'
): () => void {
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('social', 'dedup_skip', 1, 'quota_paused_invites');
    return () => {};
  }
  let disposed = false;
  let unsubs: (() => void)[] = [];

  const attach = (mode: 'native' | 'fallback') => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (disposed || isFirestoreQuotaPaused()) return;

    let incoming: GameInvite[] = [];
    let outgoing: GameInvite[] = [];
    const emit = () => onUpdate({ incoming, outgoing });

    if (direction === 'incoming' || direction === 'both') {
      const qIn =
        mode === 'native'
          ? query(collection(db, INVITES_COL), where('toUid', '==', uid))
          : query(collection(db, SOCIAL_FALLBACK_COLLECTION), where('socialInvToUid', '==', uid));

      unsubs.push(
        onSnapshot(
          qIn,
          (snap) => {
            const now = Date.now();
            incoming = snap.docs
              .map((d) => {
                const raw = d.data() as GameInvite & {
                  _deleted?: boolean;
                  socialInvFromUid?: string;
                  socialInvToUid?: string;
                };
                return {
                  ...raw,
                  id: raw.id || d.id.replace(/^soc_inv_/, ''),
                  fromUid: raw.fromUid || raw.socialInvFromUid || '',
                  toUid: raw.toUid || raw.socialInvToUid || uid,
                  expiresAt: Number(raw.expiresAt || 0),
                  createdAt: Number(raw.createdAt || 0),
                };
              })
              .filter((inv) => !inv._deleted && inv.status === 'pending' && inv.expiresAt > now)
              .sort((a, b) => b.createdAt - a.createdAt);
            emit();
          },
          (err) => {
            if (isFirestoreQuotaExceededError(err)) {
              triggerFirestoreQuotaCooldown('social', err);
              return;
            }
            if (mode === 'native' && isPermissionDeniedError(err)) {
              enableFallbackSocialStore();
              attach('fallback');
            }
          }
        )
      );
    }

    if (direction === 'outgoing' || direction === 'both') {
      const qOut =
        mode === 'native'
          ? query(collection(db, INVITES_COL), where('fromUid', '==', uid))
          : query(collection(db, SOCIAL_FALLBACK_COLLECTION), where('socialInvFromUid', '==', uid));

      unsubs.push(
        onSnapshot(
          qOut,
          (snap) => {
            const now = Date.now();
            outgoing = snap.docs
              .map((d) => {
                const raw = d.data() as GameInvite & {
                  _deleted?: boolean;
                  socialInvFromUid?: string;
                  socialInvToUid?: string;
                };
                return {
                  ...raw,
                  id: raw.id || d.id.replace(/^soc_inv_/, ''),
                  fromUid: raw.fromUid || raw.socialInvFromUid || uid,
                  toUid: raw.toUid || raw.socialInvToUid || '',
                  expiresAt: Number(raw.expiresAt || 0),
                  createdAt: Number(raw.createdAt || 0),
                };
              })
              .filter((inv) => !inv._deleted && inv.status === 'pending' && inv.expiresAt > now)
              .sort((a, b) => b.createdAt - a.createdAt);
            emit();
          },
          (err) => {
            if (isFirestoreQuotaExceededError(err)) {
              triggerFirestoreQuotaCooldown('social', err);
              return;
            }
            if (mode === 'native' && isPermissionDeniedError(err)) {
              enableFallbackSocialStore();
              attach('fallback');
            }
          }
        )
      );
    }
  };

  const unsubQuota = subscribeFirestoreQuotaState((state) => {
    if (state.paused) {
      unsubs.forEach((u) => u());
      unsubs = [];
    }
  });

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
    unsubQuota();
    unsubs.forEach((u) => u());
  };
}

// =========================================================================
// 5. NOTIFICATION CENTER
// =========================================================================
export function subscribeToNotifications(
  uid: string,
  onUpdate: (notifications: UserNotification[]) => void
): () => void {
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('social', 'dedup_skip', 1, 'quota_paused_notifications');
    return () => {};
  }
  let disposed = false;
  let unsub: (() => void) | null = null;

  const attach = (mode: 'native' | 'fallback') => {
    unsub?.();
    if (disposed || isFirestoreQuotaPaused()) return;

    const q =
      mode === 'native'
        ? query(collection(db, NOTIFICATIONS_COL), where('userId', '==', uid))
        : query(
            collection(db, SOCIAL_FALLBACK_COLLECTION),
            where('socialNotifUserId', '==', uid)
          );

    unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const raw = d.data() as UserNotification & {
              socialNotifUserId?: string;
              _deleted?: boolean;
            };
            return {
              ...raw,
              userId: raw.userId || raw.socialNotifUserId || uid,
            };
          })
          .filter((n) => !(n as { _deleted?: boolean })._deleted)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 50);
        onUpdate(list);
      },
      (err) => {
        if (isFirestoreQuotaExceededError(err)) {
          triggerFirestoreQuotaCooldown('social', err);
          return;
        }
        if (mode === 'native' && isPermissionDeniedError(err)) {
          enableFallbackSocialStore();
          attach('fallback');
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

export async function markNotificationRead(notifId: string): Promise<void> {
  const mode = await ensureSocialStoreMode();
  const altMode: 'native' | 'fallback' = mode === 'native' ? 'fallback' : 'native';
  try {
    await updateDoc(getRef('notification', notifId, mode), { isRead: true });
  } catch {
    await updateDoc(getRef('notification', notifId, altMode), { isRead: true }).catch(() => {});
  }
}

export async function markAllNotificationsRead(
  notifications: UserNotification[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.isRead);
  if (unread.length === 0) return;

  const mode = await ensureSocialStoreMode();
  const batch = writeBatch(db);
  unread.slice(0, 50).forEach((n) => {
    batch.update(getRef('notification', n.id, mode), { isRead: true });
  });
  try {
    await batch.commit();
  } catch {
    // Fallback per-item if notifications span native/fallback stores
    await Promise.all(unread.slice(0, 50).map((n) => markNotificationRead(n.id)));
  }
}

export async function deleteNotification(notifId: string): Promise<void> {
  const mode = await ensureSocialStoreMode();
  const altMode: 'native' | 'fallback' = mode === 'native' ? 'fallback' : 'native';
  try {
    const ref = getRef('notification', notifId, mode);
    if (mode === 'native') {
      await deleteDoc(ref);
    } else {
      await updateDoc(ref, { _deleted: true });
    }
  } catch {
    try {
      const altRef = getRef('notification', notifId, altMode);
      if (altMode === 'native') {
        await deleteDoc(altRef);
      } else {
        await updateDoc(altRef, { _deleted: true });
      }
    } catch {
      // ignore
    }
  }
}

// Lookup a single pending invite by ID (used from Notification Center inline Accept/Reject)
export async function fetchGameInviteById(inviteId: string): Promise<GameInvite | null> {
  const mode = await ensureSocialStoreMode();
  const altMode: 'native' | 'fallback' = mode === 'native' ? 'fallback' : 'native';

  const readOne = async (targetMode: 'native' | 'fallback'): Promise<GameInvite | null> => {
    const snap = await getDoc(getRef('invite', inviteId, targetMode));
    if (!snap.exists()) return null;
    const data = snap.data() as GameInvite & {
      _deleted?: boolean;
      socialInvFromUid?: string;
      socialInvToUid?: string;
    };
    if (data._deleted) return null;
    return {
      ...data,
      id: data.id || inviteId,
      fromUid: data.fromUid || data.socialInvFromUid || '',
      toUid: data.toUid || data.socialInvToUid || '',
    };
  };

  try {
    const primary = await readOne(mode);
    if (primary) return primary;
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('social', err);
      throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
    }
  }

  return await readOne(altMode).catch(() => null);
}

export async function fetchFriendRequestById(requestId: string): Promise<FriendRequest | null> {
  const mode = await ensureSocialStoreMode();
  const altMode: 'native' | 'fallback' = mode === 'native' ? 'fallback' : 'native';

  const readOne = async (targetMode: 'native' | 'fallback'): Promise<FriendRequest | null> => {
    const snap = await getDoc(getRef('request', requestId, targetMode));
    if (!snap.exists()) return null;
    const data = snap.data() as FriendRequest & { _deleted?: boolean };
    if (data._deleted) return null;
    return data;
  };

  try {
    const primary = await readOne(mode);
    if (primary) return primary;
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('social', err);
      throw new Error(FIRESTORE_QUOTA_EXCEEDED_MESSAGE);
    }
  }

  return await readOne(altMode).catch(() => null);
}
