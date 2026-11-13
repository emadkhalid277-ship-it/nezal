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
import {
  PLAYER_PROFILES_COLLECTION,
  SOCIAL_FALLBACK_COLLECTION,
  enableFallbackSocialStore,
  ensureSocialStoreMode,
  isPermissionDeniedError,
} from './presenceService';
import { fetchOnlineRoom } from './multiplayerService';

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

export async function isBlockedBetween(uidA: string, uidB: string): Promise<{
  blockedByMe: boolean;
  blockedMe: boolean;
}> {
  const mode = await ensureSocialStoreMode(uidA);
  const [aDoc, bDoc] = await Promise.all([
    getDoc(getRef('block', `${uidA}_${uidB}`, mode)).catch(() => null),
    getDoc(getRef('block', `${uidB}_${uidA}`, mode)).catch(() => null),
  ]);
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
  await batch.commit();
}

export async function rejectFriendRequest(
  currentUser: User,
  request: FriendRequest
): Promise<void> {
  if (!currentUser?.uid || request.toUid !== currentUser.uid) {
    throw new Error('لا تملك صلاحية رفض هذا الطلب');
  }
  const mode = await ensureSocialStoreMode(currentUser.uid);
  await updateDoc(getRef('request', request.id, mode), {
    status: 'rejected',
    updatedAt: Date.now(),
  });
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
  let disposed = false;
  let unsubs: (() => void)[] = [];

  const attach = (mode: 'native' | 'fallback') => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (disposed) return;

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
            console.warn('Error subscribing to fallback friendships:', err);
          }
        )
      );
    }
  };

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
    unsubs.forEach((u) => u());
  };
}

export function subscribeToFriendRequests(
  uid: string,
  onUpdate: (data: { incoming: FriendRequest[]; outgoing: FriendRequest[] }) => void
): () => void {
  let disposed = false;
  let unsubs: (() => void)[] = [];

  const attach = (mode: 'native' | 'fallback') => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (disposed) return;

    let incoming: FriendRequest[] = [];
    let outgoing: FriendRequest[] = [];
    const emit = () => onUpdate({ incoming, outgoing });

    const qIn =
      mode === 'native'
        ? query(collection(db, REQUESTS_COL), where('toUid', '==', uid))
        : query(collection(db, SOCIAL_FALLBACK_COLLECTION), where('socialReqToUid', '==', uid));
    const qOut =
      mode === 'native'
        ? query(collection(db, REQUESTS_COL), where('fromUid', '==', uid))
        : query(collection(db, SOCIAL_FALLBACK_COLLECTION), where('socialReqFromUid', '==', uid));

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
          if (mode === 'native' && isPermissionDeniedError(err)) {
            enableFallbackSocialStore();
            attach('fallback');
          }
        }
      )
    );

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
          if (mode === 'native' && isPermissionDeniedError(err)) {
            enableFallbackSocialStore();
            attach('fallback');
          }
        }
      )
    );
  };

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
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
  let disposed = false;
  let unsub: (() => void) | null = null;

  const attach = (mode: 'native' | 'fallback') => {
    unsub?.();
    if (disposed) return;

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
        if (mode === 'native' && isPermissionDeniedError(err)) {
          enableFallbackSocialStore();
          attach('fallback');
        }
      }
    );
  };

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
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
}

// =========================================================================
// 4. PLAY & SPECTATOR INVITES
// =========================================================================
export async function sendGameInvite(params: {
  fromUser: User;
  toPlayer: { uid: string; displayName?: string };
  roomCode: string;
  inviteType: GameInviteType;
}): Promise<GameInvite> {
  const { fromUser, toPlayer, inviteType } = params;
  const cleanCode = params.roomCode.trim().toUpperCase();

  if (!fromUser?.uid) throw new Error('يجب تسجيل الدخول أولاً');
  if (!toPlayer?.uid || toPlayer.uid === fromUser.uid) {
    throw new Error('لا يمكنك إرسال دعوة إلى نفسك');
  }
  if (!cleanCode || cleanCode.length < 4) {
    throw new Error('رمز الغرفة غير صالح');
  }

  const mode = await ensureSocialStoreMode(fromUser.uid);

  // Verify friendship
  const { pairId } = getSortedPairId(fromUser.uid, toPlayer.uid);
  const friendSnap = await getDoc(getRef('friendship', pairId, mode)).catch(() => null);
  if (
    !friendSnap ||
    !friendSnap.exists() ||
    (friendSnap.data() as { _deleted?: boolean })?._deleted
  ) {
    throw new Error('يمكنك إرسال الدعوات للأصدقاء فقط');
  }

  // Verify not blocked
  const blockState = await isBlockedBetween(fromUser.uid, toPlayer.uid);
  if (blockState.blockedByMe || blockState.blockedMe) {
    throw new Error('تعذر إرسال الدعوة بسبب إعدادات الحظر');
  }

  // Verify recipient invite settings
  const targetProfileSnap = await getDoc(getRef('profile', toPlayer.uid, mode)).catch(
    () => null
  );
  if (targetProfileSnap && targetProfileSnap.exists()) {
    const profile = targetProfileSnap.data() as PlayerProfile;
    if (profile.acceptsInvites === false) {
      throw new Error('أوقف هذا الصديق استقبال دعوات اللعب والمشاهدة');
    }
  }

  // Verify room exists and is open
  const room = await fetchOnlineRoom(cleanCode);
  if (!room) {
    throw new Error('الغرفة غير موجودة أو تم إغلاقها');
  }
  if (room.status === 'finished' || room.status === 'completed') {
    throw new Error('المباراة في هذه الغرفة قد انتهت بالفعل');
  }
  if (inviteType === 'play') {
    const playerCount = Object.keys(room.players || {}).length;
    if (playerCount >= (room.maxPlayers || 16)) {
      throw new Error('الغرفة ممتلئة حالياً');
    }
    if (
      (room.status === 'playing' || room.status === 'in_game') &&
      playerCount >= 2 &&
      !room.players?.[toPlayer.uid]
    ) {
      throw new Error('المباراة بدأت بالفعل، يمكنك إرسال دعوة للمشاهدة بدلاً من ذلك');
    }
  }

  const now = Date.now();
  const inviteId = `${fromUser.uid}_${toPlayer.uid}_${cleanCode}_${inviteType}`;
  const invDocRef = getRef('invite', inviteId, mode);
  const existingInviteSnap = await getDoc(invDocRef).catch(() => null);

  if (existingInviteSnap && existingInviteSnap.exists()) {
    const prev = existingInviteSnap.data() as GameInvite & { _deleted?: boolean };
    if (!prev._deleted && prev.status === 'pending' && prev.expiresAt > now) {
      throw new Error('توجد دعوة نشطة مرسلة بالفعل لهذا الصديق في نفس الغرفة');
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

  const notifId = `notif_inv_${inviteId}_${now}`;
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

  const batch = writeBatch(db);
  if (mode === 'native') {
    if (existingInviteSnap && existingInviteSnap.exists()) {
      batch.update(invDocRef, {
        fromName: myName,
        fromPhotoURL: fromUser.photoURL || '',
        toName: invitePayload.toName,
        status: 'pending',
        createdAt: now,
        expiresAt,
        updatedAt: now,
      });
    } else {
      batch.set(invDocRef, invitePayload);
    }
    batch.set(getRef('notification', notifId, 'native'), notifPayload);
  } else {
    batch.set(invDocRef, {
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

  return invitePayload;
}

export async function acceptGameInvite(
  currentUser: User,
  invite: GameInvite
): Promise<{ roomCode: string; inviteType: GameInviteType }> {
  if (!currentUser?.uid || invite.toUid !== currentUser.uid) {
    throw new Error('لا تملك صلاحية قبول هذه الدعوة');
  }
  if (invite.status !== 'pending') {
    throw new Error('هذه الدعوة لم تعد صالحة أو تم الرد عليها مسبقاً');
  }

  const mode = await ensureSocialStoreMode(currentUser.uid);
  const now = Date.now();
  const invDocRef = getRef('invite', invite.id, mode);

  if (invite.expiresAt && now > invite.expiresAt) {
    await updateDoc(invDocRef, { status: 'expired', updatedAt: now }).catch(() => {});
    throw new Error('انتهت صلاحية هذه الدعوة');
  }

  const room = await fetchOnlineRoom(invite.roomCode);
  if (!room) {
    await updateDoc(invDocRef, { status: 'expired', updatedAt: now }).catch(() => {});
    throw new Error('الغرفة غير موجودة أو تم إغلاقها');
  }
  if (room.status === 'finished' || room.status === 'completed') {
    await updateDoc(invDocRef, { status: 'expired', updatedAt: now }).catch(() => {});
    throw new Error('المباراة في هذه الغرفة قد انتهت بالفعل');
  }

  if (invite.inviteType === 'play') {
    const playersCount = Object.keys(room.players || {}).length;
    const isAlreadyInRoom = Boolean(room.players?.[currentUser.uid]);
    if (!isAlreadyInRoom) {
      if (playersCount >= (room.maxPlayers || 16)) {
        throw new Error('الغرفة ممتلئة حالياً');
      }
      if (
        (room.status === 'playing' || room.status === 'in_game') &&
        playersCount >= 2
      ) {
        throw new Error('بدأت المباراة بالفعل في هذه الغرفة، يمكنك الانضمام كمشاهد بدلاً من ذلك');
      }
    }
  }

  await updateDoc(invDocRef, {
    status: 'accepted',
    updatedAt: now,
  });

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
    throw new Error('لا تملك صلاحية رفض هذه الدعوة');
  }
  const mode = await ensureSocialStoreMode(currentUser.uid);
  await updateDoc(getRef('invite', invite.id, mode), {
    status: 'rejected',
    updatedAt: Date.now(),
  });
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
  onUpdate: (data: { incoming: GameInvite[]; outgoing: GameInvite[] }) => void
): () => void {
  let disposed = false;
  let unsubs: (() => void)[] = [];

  const attach = (mode: 'native' | 'fallback') => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (disposed) return;

    let incoming: GameInvite[] = [];
    let outgoing: GameInvite[] = [];
    const emit = () => onUpdate({ incoming, outgoing });

    const qIn =
      mode === 'native'
        ? query(collection(db, INVITES_COL), where('toUid', '==', uid))
        : query(collection(db, SOCIAL_FALLBACK_COLLECTION), where('socialInvToUid', '==', uid));
    const qOut =
      mode === 'native'
        ? query(collection(db, INVITES_COL), where('fromUid', '==', uid))
        : query(collection(db, SOCIAL_FALLBACK_COLLECTION), where('socialInvFromUid', '==', uid));

    unsubs.push(
      onSnapshot(
        qIn,
        (snap) => {
          const now = Date.now();
          incoming = snap.docs
            .map((d) => d.data() as GameInvite & { _deleted?: boolean })
            .filter((inv) => !inv._deleted && inv.status === 'pending' && inv.expiresAt > now)
            .sort((a, b) => b.createdAt - a.createdAt);
          emit();
        },
        (err) => {
          if (mode === 'native' && isPermissionDeniedError(err)) {
            enableFallbackSocialStore();
            attach('fallback');
          }
        }
      )
    );

    unsubs.push(
      onSnapshot(
        qOut,
        (snap) => {
          const now = Date.now();
          outgoing = snap.docs
            .map((d) => d.data() as GameInvite & { _deleted?: boolean })
            .filter((inv) => !inv._deleted && inv.status === 'pending' && inv.expiresAt > now)
            .sort((a, b) => b.createdAt - a.createdAt);
          emit();
        },
        (err) => {
          if (mode === 'native' && isPermissionDeniedError(err)) {
            enableFallbackSocialStore();
            attach('fallback');
          }
        }
      )
    );
  };

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
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
  let disposed = false;
  let unsub: (() => void) | null = null;

  const attach = (mode: 'native' | 'fallback') => {
    unsub?.();
    if (disposed) return;

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
        if (mode === 'native' && isPermissionDeniedError(err)) {
          enableFallbackSocialStore();
          attach('fallback');
        }
      }
    );
  };

  ensureSocialStoreMode(uid).then((mode) => attach(mode));

  return () => {
    disposed = true;
    unsub?.();
  };
}

export async function markNotificationRead(notifId: string): Promise<void> {
  const mode = await ensureSocialStoreMode();
  try {
    await updateDoc(getRef('notification', notifId, mode), { isRead: true });
  } catch {
    // ignore if deleted
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
  await batch.commit();
}

export async function deleteNotification(notifId: string): Promise<void> {
  const mode = await ensureSocialStoreMode();
  try {
    const ref = getRef('notification', notifId, mode);
    if (mode === 'native') {
      await deleteDoc(ref);
    } else {
      await updateDoc(ref, { _deleted: true });
    }
  } catch {
    // ignore
  }
}

// Lookup a single pending invite by ID (used from Notification Center inline Accept/Reject)
export async function fetchGameInviteById(inviteId: string): Promise<GameInvite | null> {
  const mode = await ensureSocialStoreMode();
  const snap = await getDoc(getRef('invite', inviteId, mode));
  if (!snap.exists()) return null;
  const data = snap.data() as GameInvite & { _deleted?: boolean };
  if (data._deleted) return null;
  return data;
}

export async function fetchFriendRequestById(requestId: string): Promise<FriendRequest | null> {
  const mode = await ensureSocialStoreMode();
  const snap = await getDoc(getRef('request', requestId, mode));
  if (!snap.exists()) return null;
  const data = snap.data() as FriendRequest & { _deleted?: boolean };
  if (data._deleted) return null;
  return data;
}
