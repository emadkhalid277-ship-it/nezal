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
  formatSocialErrorMessage,
  markAllNotificationsRead,
  markNotificationRead,
  rejectFriendRequest,
  rejectGameInvite,
  subscribeToFriendRequests,
  subscribeToGameInvites,
  subscribeToNotifications,
} from '../services/socialService';
import { AlertBanner } from './ui';

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
  const [resolvedNotifIds, setResolvedNotifIds] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setResolvedNotifIds(new Set());
    if (!user?.uid) {
      setNotifications([]);
      setIncomingRequests([]);
      setIncomingInvites([]);
      return;
    }

    const unsubNotifs = subscribeToNotifications(user.uid, setNotifications);
    const unsubReqs = subscribeToFriendRequests(
      user.uid,
      ({ incoming }) => {
        setIncomingRequests(incoming);
      },
      'incoming'
    );
    const unsubInvs = subscribeToGameInvites(
      user.uid,
      ({ incoming }) => {
        setIncomingInvites(incoming);
      },
      'incoming'
    );

    return () => {
      unsubNotifs();
      unsubReqs();
      unsubInvs();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

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

  const markResolvedLocally = (notifId: string) => {
    setResolvedNotifIds((prev) => {
      if (prev.has(notifId)) return prev;
      const next = new Set(prev);
      next.add(notifId);
      return next;
    });
  };

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
        markResolvedLocally(notif.id);
        await markNotificationRead(notif.id);
        setActionError('طلب الصداقة لم يعد معلقاً');
        return;
      }
      if (accept) {
        await acceptFriendRequest(user, req);
      } else {
        await rejectFriendRequest(user, req);
      }
      markResolvedLocally(notif.id);
      await markNotificationRead(notif.id);
    } catch (err: any) {
      setActionError(formatSocialErrorMessage(err, 'تعذر تنفيذ الإجراء.'));
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
        markResolvedLocally(notif.id);
        await markNotificationRead(notif.id);
        setActionError('هذه الدعوة لم تعد صالحة أو انتهت.');
        return;
      }
      if (accept) {
        const result = await acceptGameInvite(user, inv);
        markResolvedLocally(notif.id);
        await markNotificationRead(notif.id);
        setIsOpen(false);
        onJoinRoomFromInvite(
          result.roomCode,
          result.inviteType === 'spectate' ? 'spectator' : 'player'
        );
      } else {
        await rejectGameInvite(user, inv);
        markResolvedLocally(notif.id);
        await markNotificationRead(notif.id);
      }
    } catch (err: any) {
      const msg = formatSocialErrorMessage(err, 'تعذر قبول الدعوة.');
      if (
        msg.includes('انتهت صلاحية') ||
        msg.includes('لم تعد صالحة') ||
        msg.includes('غير موجودة') ||
        msg.includes('قد انتهت')
      ) {
        markResolvedLocally(notif.id);
        void markNotificationRead(notif.id);
      }
      setActionError(msg);
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
        return <AlertCircle className="w-4 h-4 text-[#52574E]" />;
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
        aria-expanded={isOpen}
        aria-label="مركز الإشعارات"
        title="مركز الإشعارات"
        className={`relative min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
          isOpen
            ? 'bg-[#14543D] border-[#14543D] text-white'
            : unreadCount > 0
            ? 'bg-[#FEF2EC] border-[#F07842]/30 text-[#14543D] hover:bg-[#FDE5D7]'
            : 'bg-[#F3F5E9] border-[#E5E8DD] text-[#1B1F1C] hover:bg-[#E7EAD8]'
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-md bg-[#F07842] text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
            className="sm:hidden fixed inset-0 top-[50px] bg-[#1B1F1C]/25 z-40"
          />
          <div className="fixed sm:absolute top-[56px] sm:top-auto left-3 right-3 sm:right-auto sm:left-0 sm:mt-2 sm:w-96 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] shadow-2xl z-50 overflow-hidden text-right">
            {/* Header */}
            <div className="px-4 py-2.5 sm:py-3 bg-[#F7F8F1] border-b border-[#E5E8DD] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#F07842]" />
                <span className="font-display text-sm font-bold text-[#1B1F1C]">
                  مركز الإشعارات
                </span>
                {unreadCount > 0 && (
                  <span className="text-[11px] font-bold text-[#14543D] tabular-nums">
                    ({unreadCount} جديد)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllNotificationsRead(notifications)}
                    className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[32px] px-2 rounded-lg text-[11px] font-bold text-[#14543D] hover:text-[#F07842] hover:bg-[#FFFFFF] cursor-pointer transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>تحديد الكل كمقروء</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="إغلاق الإشعارات"
                  className="sm:hidden min-w-[44px] min-h-[44px] rounded-xl hover:bg-[#E5E8DD]/50 text-[#52574E] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

          {actionError && (
            <div className="mx-3 mt-3">
              <AlertBanner tone="error" onDismiss={() => setActionError(null)}>
                {actionError}
              </AlertBanner>
            </div>
          )}

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#E5E8DD]">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2 text-[#52574E]">
                <Bell className="w-7 h-7 mx-auto opacity-35" />
                <p className="text-xs font-bold">لا توجد إشعارات حالياً</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isResolvedLocally = resolvedNotifIds.has(notif.id);
                const pendingFriendReq =
                  notif.type === 'friend_request' && notif.relatedId
                    ? pendingReqMap.get(notif.relatedId)
                    : undefined;
                const pendingInvite =
                  (notif.type === 'play_invite' || notif.type === 'spectate_invite') &&
                  notif.relatedId
                    ? pendingInviteMap.get(notif.relatedId)
                    : undefined;
                const showFriendActions =
                  !isResolvedLocally &&
                  notif.type === 'friend_request' &&
                  Boolean(notif.relatedId) &&
                  (Boolean(pendingFriendReq) || !notif.isRead);
                const showInviteActions =
                  !isResolvedLocally &&
                  (notif.type === 'play_invite' || notif.type === 'spectate_invite') &&
                  Boolean(notif.relatedId) &&
                  (Boolean(pendingInvite) ||
                    (Boolean(notif.roomCode) &&
                      (!notif.expiresAt || Number(notif.expiresAt) > Date.now())));
                const isBusy = busyId === notif.id;

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.isRead) markNotificationRead(notif.id);
                    }}
                    className={`p-3.5 space-y-2.5 transition-colors ${
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
                            <span className="text-xs font-bold text-[#1B1F1C]">
                              {notif.title}
                            </span>
                            {!notif.isRead && (
                              <span className="w-2 h-2 rounded-full bg-[#F07842] shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-[#52574E] leading-relaxed">
                            {notif.message}
                          </p>
                          <div className="text-[10px] text-[#666B62] tabular-nums">
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
                        aria-label="حذف الإشعار"
                        className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-[#52574E] hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer shrink-0 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Quick inline actions for pending friend requests */}
                    {showFriendActions && (
                      <div
                        className="flex items-center gap-2 pr-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleFriendDecision(notif, true)}
                          className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>قبول</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleFriendDecision(notif, false)}
                          className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#F3F5E9] hover:bg-rose-50 text-[#52574E] hover:text-rose-700 text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          رفض
                        </button>
                      </div>
                    )}

                    {/* Quick inline actions for pending game / spectate invites */}
                    {showInviteActions && (
                      <div
                        className="flex items-center gap-2 pr-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleInviteDecision(notif, true)}
                          className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          {notif.inviteType === ('spectate' as GameInviteType) ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>مشاهدة الآن</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>قبول وانضمام</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleInviteDecision(notif, false)}
                          className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#F3F5E9] hover:bg-rose-50 text-[#52574E] hover:text-rose-700 text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors"
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
          <div className="px-4 py-2.5 bg-[#F7F8F1] border-t border-[#E5E8DD]">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNavigate('friends');
              }}
              className="w-full min-h-[44px] sm:min-h-[40px] py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#F07842] text-xs font-bold text-[#14543D] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-[#F07842]" />
              <span>فتح صفحة الأصدقاء</span>
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
};
