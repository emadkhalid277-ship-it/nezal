export type PresenceStatus = 'online' | 'offline' | 'in_lobby' | 'in_match';

export interface PlayerProfile {
  uid: string;
  displayName: string;
  displayNameLower: string;
  photoURL?: string;
  acceptsInvites: boolean;
  presenceStatus: PresenceStatus;
  isExplicitlyOnline: boolean;
  currentRoomCode?: string | null;
  sessionId?: string | null;
  lastHeartbeat: number;
  updatedAt?: any;
}

export interface UserBlock {
  id: string; // `${blockerUid}_${blockedUid}`
  blockerUid: string;
  blockedUid: string;
  blockedName?: string;
  blockedPhotoURL?: string;
  createdAt: number;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface FriendRequest {
  id: string; // `${fromUid}_${toUid}`
  fromUid: string;
  fromName?: string;
  fromPhotoURL?: string;
  toUid: string;
  toName?: string;
  toPhotoURL?: string;
  status: FriendRequestStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Friendship {
  id: string; // sorted `${minUid}_${maxUid}`
  user1: string;
  user2: string;
  user1Name?: string;
  user1PhotoURL?: string;
  user2Name?: string;
  user2PhotoURL?: string;
  requestId: string;
  createdBy: string;
  createdAt: number;
}

export type GameInviteType = 'play' | 'spectate';
export type GameInviteStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export interface GameInvite {
  id: string; // `${fromUid}_${toUid}_${roomCode}_${inviteType}`
  fromUid: string;
  fromName?: string;
  fromPhotoURL?: string;
  toUid: string;
  toName?: string;
  roomCode: string;
  inviteType: GameInviteType;
  status: GameInviteStatus;
  createdAt: number;
  expiresAt: number;
  updatedAt: number;
}

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'play_invite'
  | 'spectate_invite'
  | 'invite_cancelled'
  | 'invite_expired';

export interface UserNotification {
  id: string;
  userId: string;
  actorUid: string;
  actorName?: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: string;
  roomCode?: string;
  inviteType?: GameInviteType;
  isRead: boolean;
  createdAt: number;
  expiresAt?: number;
}
