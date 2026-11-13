import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Bell,
  Check,
  CheckCheck,
  Eye,
  Play,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  AlertCircle,
} from 'lucide-react';
import { PageView } from '../types/game';
import {
  FriendRequest,
  GameInvite,
  GameInviteType,
  UserNotification,
} from '../types/social';
import {
  acceptFriendRequest,
  acceptGameInvite,
  deleteNotification,
  fetchFriendRequestById,
  fetchGameInviteById,
  markAllNotificationsRead,
  markNotificationRead,
  rejectFriendRequest,
  rejectGameInvite,
  subscribeToFriendRequests,
  subscribeToGameInvites,
  subscribeToNotifications,
} from '../services/socialService';

interface NotificationsCenterProps {
  user: User | null;
  onNavigate: (page: PageView) => void;
  onJoinRoomFromInvite: (roomCode: string, role: 'player' | 'spectator') => void;
}

function formatRelativeArabicTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'الآن';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} د`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} س`;
  const diffDays = Math.floor(diffHours / 24);
  return `منذ ${diffDays} ي`;
}

export const NotificationsCenter: React.FC<NotificationsCenterProps> = ({
  user,
  onNavigate,
  onJoinRoomFromInvite,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<GameInvite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setIncomingRequests([]);
      setIncomingInvites([]);
      return;
    }

    const unsubNotifs = subscribeToNotifications(user.uid, setNotifications);
    const unsubReqs = subscribeToFriendRequests(user.uid, ({ incoming }) => {
      setIncomingRequests(incoming);
    });
    const unsubInvs = subscribeToGameInvites(user.uid, ({ incoming }) => {
      setIncomingInvites(incoming);
    });

    return () => {
      unsubNotifs();
      unsubReqs();
      unsubInvs();
    };
  }, [user?.uid]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const pendingReqMap = useMemo(() => {
    const map = new Map<string, FriendRequest>();
    incomingRequests.forEach((r) => map.set(r.id, r));
    return map;
  }, [incomingRequests]);

  const pendingInviteMap = useMemo(() => {
    const map = new Map<string, GameInvite>();
    incomingInvites.forEach((inv) => map.set(inv.id, inv));
    return map;
  }, [incomingInvites]);

  if (!user) return null;

  const handleFriendDecision = async (
    notif: UserNotification,
    accept: boolean
  ) => {
    if (!notif.relatedId) return;
    setBusyId(notif.id);
    setActionError(null);
    try {
      const req =
        pendingReqMap.get(notif.relatedId) ||
        (await fetchFriendRequestById(notif.relatedId));
      if (!req || req.status !== 'pending') {
        await markNotificationRead(notif.id);
        setActionError('طلب الصداقة لم يعد معلقاً');
        return;
      }
      if (accept) {
        await acceptFriendRequest(user, req);
      } else {
        await rejectFriendRequest(user, req);
      }
      await markNotificationRead(notif.id);
    } catch (err: any) {
      setActionError(err?.message || 'تعذر تنفيذ الإجراء');
    } finally {
      setBusyId(null);
    }
  };

  const handleInviteDecision = async (
    notif: UserNotification,
    accept: boolean
  ) => {
    if (!notif.relatedId) return;
    setBusyId(notif.id);
    setActionError(null);
    try {
      const inv =
        pendingInviteMap.get(notif.relatedId) ||
        (await fetchGameInviteById(notif.relatedId));
      if (!inv || inv.status !== 'pending') {
        await markNotificationRead(notif.id);
        setActionError('هذه الدعوة لم تعد صالحة أو انتهت');
        return;
      }
      if (accept) {
        const result = await acceptGameInvite(user, inv);
        await markNotificationRead(notif.id);
        setIsOpen(false);
        onJoinRoomFromInvite(
          result.roomCode,
          result.inviteType === 'spectate' ? 'spectator' : 'player'
        );
      } else {
        await rejectGameInvite(user, inv);
        await markNotificationRead(notif.id);
      }
    } catch (err: any) {
      setActionError(err?.message || 'تعذر قبول الدعوة');
    } finally {
      setBusyId(null);
    }
  };

  const getNotificationIcon = (type: UserNotification['type']) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-[#14543D]" />;
      case 'friend_accepted':
        return <UserCheck className="w-4 h-4 text-emerald-600" />;
      case 'play_invite':
        return <Play className="w-4 h-4 text-[#F07842]" />;
      case 'spectate_invite':
        return <Eye className="w-4 h-4 text-[#14543D]" />;
      default:
        return <AlertCircle className="w-4 h-4 text-[#777B73]" />;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setActionError(null);
        }}
        aria-label="مركز الإشعارات"
        title="مركز الإشعارات"
        className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
          isOpen
            ? 'bg-[#14543D] border-[#14543D] text-white'
            : unreadCount > 0
            ? 'bg-[#FEF2EC] border-[#F07842]/30 text-[#14543D] hover:bg-[#FDE5D7]'
            : 'bg-[#F3F5E9] border-[#E5E8DD] text-[#252824] hover:bg-[#E5E8DD]'
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#F07842] text-white text-[10px] font-bold flex items-center justify-center tabular-nums shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed sm:absolute left-4 right-4 sm:right-auto sm:left-0 mt-2 sm:w-96 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 text-right">
          {/* Header */}
          <div className="px-4 py-3 bg-[#F3F5E9] border-b border-[#E5E8DD] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#F07842]" />
              <span className="font-display text-sm font-bold text-[#252824]">
                مركز الإشعارات
              </span>
              {unreadCount > 0 && (
                <span className="text-[11px] font-bold text-[#14543D] tabular-nums">
                  ({unreadCount} جديد)
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllNotificationsRead(notifications)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#14543D] hover:text-[#F07842] cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>تحديد الكل كمقروء</span>
              </button>
            )}
          </div>

          {actionError && (
            <div className="mx-3 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold flex items-center justify-between gap-2">
              <span>{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-rose-500 hover:text-rose-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#E5E8DD]">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2 text-[#777B73]">
                <Bell className="w-7 h-7 mx-auto opacity-35" />
                <p className="text-xs font-bold">لا توجد إشعارات حالياً</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const pendingFriendReq =
                  notif.type === 'friend_request' && notif.relatedId
                    ? pendingReqMap.get(notif.relatedId)
                    : undefined;
                const pendingInvite =
                  (notif.type === 'play_invite' || notif.type === 'spectate_invite') &&
                  notif.relatedId
                    ? pendingInviteMap.get(notif.relatedId)
                    : undefined;
                const isBusy = busyId === notif.id;

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.isRead) markNotificationRead(notif.id);
                    }}
                    className={`p-3.5 space-y-2 transition-colors ${
                      notif.isRead ? 'bg-[#FFFFFF]' : 'bg-[#EAF2EE]/35'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center justify-center shrink-0 mt-0.5">
                          {getNotificationIcon(notif.type)}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#252824]">
                              {notif.title}
                            </span>
                            {!notif.isRead && (
                              <span className="w-2 h-2 rounded-full bg-[#F07842] shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-[#777B73] leading-relaxed">
                            {notif.message}
                          </p>
                          <div className="text-[10px] text-[#777B73] tabular-nums">
                            {formatRelativeArabicTime(notif.createdAt)}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notif.id);
                        }}
                        title="حذف الإشعار"
                        className="p-1 text-[#777B73] hover:text-rose-600 rounded-lg cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Quick inline actions for pending friend requests */}
                    {pendingFriendReq && (
                      <div
                        className="flex items-center gap-2 pr-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleFriendDecision(notif, true)}
                          className="px-3 py-1 rounded-lg bg-[#14543D] hover:bg-[#0E3D2C] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                          <span>قبول</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleFriendDecision(notif, false)}
                          className="px-3 py-1 rounded-lg bg-[#F3F5E9] hover:bg-rose-50 text-[#777B73] hover:text-rose-700 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          رفض
                        </button>
                      </div>
                    )}

                    {/* Quick inline actions for pending game / spectate invites */}
                    {pendingInvite && (
                      <div
                        className="flex items-center gap-2 pr-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleInviteDecision(notif, true)}
                          className="px-3 py-1 rounded-lg bg-[#F07842] hover:bg-[#D9632E] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {notif.inviteType === ('spectate' as GameInviteType) ? (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>مشاهدة الآن</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3" />
                              <span>قبول وانضمام</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleInviteDecision(notif, false)}
                          className="px-3 py-1 rounded-lg bg-[#F3F5E9] hover:bg-rose-50 text-[#777B73] hover:text-rose-700 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          رفض
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer link to Friends page */}
          <div className="px-4 py-2.5 bg-[#F3F5E9]/70 border-t border-[#E5E8DD] flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNavigate('friends');
              }}
              className="w-full py-1.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#14543D] text-xs font-bold text-[#14543D] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-[#F07842]" />
              <span>فتح صفحة الأصدقاء</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
