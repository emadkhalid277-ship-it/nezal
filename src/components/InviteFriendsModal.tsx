import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  X,
  UserPlus,
  Play,
  Eye,
  Check,
  AlertCircle,
  Search,
  Users,
  ShieldOff,
} from 'lucide-react';
import {
  Friendship,
  GameInvite,
  GameInviteType,
  PlayerProfile,
} from '../types/social';
import {
  formatPresenceLabel,
  resolveEffectivePresence,
  subscribeToPlayerProfiles,
} from '../services/presenceService';
import {
  sendGameInvite,
  subscribeToFriendships,
  subscribeToGameInvites,
} from '../services/socialService';

interface InviteFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  roomCode: string;
  canInviteToPlay: boolean;
}

export const InviteFriendsModal: React.FC<InviteFriendsModalProps> = ({
  isOpen,
  onClose,
  user,
  roomCode,
  canInviteToPlay,
}) => {
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>({});
  const [outgoingInvites, setOutgoingInvites] = useState<GameInvite[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [sentFeedback, setSentFeedback] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user?.uid) return;
    const unsubFriends = subscribeToFriendships(user.uid, setFriendships);
    const unsubInvites = subscribeToGameInvites(user.uid, ({ outgoing }) => {
      setOutgoingInvites(outgoing);
    });
    return () => {
      unsubFriends();
      unsubInvites();
    };
  }, [isOpen, user?.uid]);

  const friendEntries = useMemo(() => {
    if (!user?.uid) return [];
    return friendships.map((f) => {
      const isUser1 = f.user1 === user.uid;
      const friendUid = isUser1 ? f.user2 : f.user1;
      const fallbackName = isUser1 ? f.user2Name : f.user1Name;
      const fallbackPhoto = isUser1 ? f.user2PhotoURL : f.user1PhotoURL;
      const profile = profiles[friendUid];
      const status = resolveEffectivePresence(profile);
      return {
        uid: friendUid,
        displayName: profile?.displayName || fallbackName || 'لاعب نِزال',
        photoURL: profile?.photoURL || fallbackPhoto || '',
        acceptsInvites: profile ? profile.acceptsInvites !== false : true,
        status,
      };
    });
  }, [friendships, profiles, user?.uid]);

  useEffect(() => {
    if (!isOpen || !user?.uid) return;
    const uids = friendships.map((f) => (f.user1 === user.uid ? f.user2 : f.user1));
    return subscribeToPlayerProfiles(uids, setProfiles);
  }, [isOpen, friendships, user?.uid]);

  const filteredFriends = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = q
      ? friendEntries.filter((f) => f.displayName.toLowerCase().includes(q))
      : friendEntries;
    return [...list].sort((a, b) => {
      const aOnline = a.status !== 'offline' ? 0 : 1;
      const bOnline = b.status !== 'offline' ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.displayName.localeCompare(b.displayName, 'ar');
    });
  }, [friendEntries, searchTerm]);

  const hasPendingInvite = (friendUid: string, inviteType: GameInviteType) => {
    const cleanCode = roomCode.trim().toUpperCase();
    return outgoingInvites.some(
      (inv) =>
        inv.toUid === friendUid &&
        inv.roomCode === cleanCode &&
        inv.inviteType === inviteType &&
        inv.status === 'pending' &&
        inv.expiresAt > Date.now()
    );
  };

  const handleSendInvite = async (
    friend: { uid: string; displayName: string },
    inviteType: GameInviteType
  ) => {
    if (!user) return;
    const key = `${friend.uid}_${inviteType}`;
    setSendingKey(key);
    setErrorMsg(null);
    try {
      await sendGameInvite({
        fromUser: user,
        toPlayer: { uid: friend.uid, displayName: friend.displayName },
        roomCode,
        inviteType,
      });
      setSentFeedback((prev) => ({ ...prev, [key]: true }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر إرسال الدعوة');
    } finally {
      setSendingKey(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E8DD] bg-[#F3F5E9]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#14543D] text-white flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-[#252824]">
                دعوة الأصدقاء للغرفة
              </h3>
              <p className="text-[11px] text-[#777B73]">
                رمز الغرفة: <span className="font-mono font-bold text-[#14543D]">{roomCode}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-2 rounded-xl text-[#777B73] hover:text-[#252824] hover:bg-[#E5E8DD]/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Search Friends */}
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[#777B73]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث في قائمة أصدقائك..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#E5E8DD] focus:border-[#14543D] text-xs font-bold text-[#252824] outline-none"
            />
          </div>

          {/* Friends List */}
          <div className="max-h-[340px] overflow-y-auto space-y-2.5 pr-1">
            {filteredFriends.length === 0 ? (
              <div className="py-10 text-center space-y-2 text-[#777B73]">
                <Users className="w-8 h-8 mx-auto opacity-40" />
                <p className="text-xs font-bold">
                  {friendEntries.length === 0
                    ? 'لا يوجد لديك أصدقاء مضافون بعد. أضف أصدقاء من صفحة الأصدقاء!'
                    : 'لا توجد نتائج مطابقة لبحثك'}
                </p>
              </div>
            ) : (
              filteredFriends.map((friend) => {
                const isOnline = friend.status !== 'offline';
                const playPending =
                  sentFeedback[`${friend.uid}_play`] ||
                  hasPendingInvite(friend.uid, 'play');
                const spectatePending =
                  sentFeedback[`${friend.uid}_spectate`] ||
                  hasPendingInvite(friend.uid, 'spectate');

                return (
                  <div
                    key={friend.uid}
                    className="p-3 rounded-2xl border border-[#E5E8DD] bg-[#F3F5E9]/45 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        {friend.photoURL ? (
                          <img
                            src={friend.photoURL}
                            alt={friend.displayName}
                            className="w-9 h-9 rounded-full object-cover border border-[#E5E8DD]"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#14543D] text-white flex items-center justify-center text-xs font-bold">
                            {friend.displayName[0]?.toUpperCase() || 'ن'}
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            friend.status === 'online'
                              ? 'bg-emerald-500'
                              : friend.status === 'in_lobby'
                              ? 'bg-sky-500'
                              : friend.status === 'in_match'
                              ? 'bg-[#F07842]'
                              : 'bg-[#777B73]/50'
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#252824] truncate">
                          {friend.displayName}
                        </div>
                        <div
                          className={`text-[11px] font-medium ${
                            isOnline ? 'text-[#14543D]' : 'text-[#777B73]'
                          }`}
                        >
                          {formatPresenceLabel(friend.status)}
                        </div>
                      </div>
                    </div>

                    {!friend.acceptsInvites ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E5E8DD]/70 text-[11px] font-bold text-[#777B73] shrink-0">
                        <ShieldOff className="w-3 h-3" />
                        <span>أوقف الدعوات</span>
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {canInviteToPlay && (
                          <button
                            type="button"
                            disabled={playPending || sendingKey === `${friend.uid}_play`}
                            onClick={() => handleSendInvite(friend, 'play')}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                              playPending
                                ? 'bg-emerald-100 text-emerald-800 cursor-default'
                                : 'bg-[#14543D] text-white hover:bg-[#0E3D2C]'
                            }`}
                          >
                            {playPending ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>دُعي للعب</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3" />
                                <span>للعب</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={spectatePending || sendingKey === `${friend.uid}_spectate`}
                          onClick={() => handleSendInvite(friend, 'spectate')}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                            spectatePending
                              ? 'bg-emerald-100 text-emerald-800 cursor-default'
                              : 'bg-[#FFFFFF] border border-[#E5E8DD] text-[#252824] hover:border-[#F07842] hover:text-[#F07842]'
                          }`}
                        >
                          {spectatePending ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>دُعي للمشاهدة</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>للمشاهدة</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
