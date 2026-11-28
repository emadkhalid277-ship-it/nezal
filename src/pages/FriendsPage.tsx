import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Users,
  UserPlus,
  Search,
  Check,
  Play,
  Eye,
  UserMinus,
  Ban,
  ShieldCheck,
  ShieldOff,
  BellRing,
  Clock,
  Radio,
  Unlock,
  ArrowLeft,
} from 'lucide-react';
import {
  FriendRequest,
  Friendship,
  GameInvite,
  GameInviteType,
  PlayerProfile,
  PresenceStatus,
  UserBlock,
} from '../types/social';
import {
  formatPresenceLabel,
  resolveEffectivePresence,
  subscribeToMyPlayerProfile,
  subscribeToPlayerProfiles,
} from '../services/presenceService';
import {
  acceptFriendRequest,
  acceptGameInvite,
  blockUser,
  cancelFriendRequest,
  cancelGameInvite,
  formatSocialErrorMessage,
  rejectFriendRequest,
  rejectGameInvite,
  removeFriend,
  searchPlayersByUsername,
  sendFriendRequest,
  sendGameInvite,
  subscribeToBlockedUsers,
  subscribeToFriendRequests,
  subscribeToFriendships,
  subscribeToGameInvites,
  unblockUser,
  updateAcceptsInvitesSetting,
} from '../services/socialService';
import { OnlineGameRoom } from '../types/multiplayer';
import { createOnlineRoom } from '../services/multiplayerService';
import { AlertBanner, EmptyState, StatusBadge, UI_CLASSES } from '../components/ui';

interface FriendsPageProps {
  user: User | null;
  activeOnlineRoomCode?: string | null;
  onOpenAuthModal: () => void;
  onNavigateHome: () => void;
  onEnterRoom: (roomCode: string, role: 'player' | 'spectator') => void;
}

type FriendsTab = 'friends' | 'requests' | 'invites' | 'blocked';
type PresenceFilter = 'all' | 'online' | 'offline';

export const FriendsPage: React.FC<FriendsPageProps> = ({
  user,
  activeOnlineRoomCode,
  onOpenAuthModal,
  onNavigateHome,
  onEnterRoom,
}) => {
  const [activeTab, setActiveTab] = useState<FriendsTab>('friends');
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all');
  const [friendFilterText, setFriendFilterText] = useState('');

  // Own profile (for acceptsInvites preference)
  const [myProfile, setMyProfile] = useState<PlayerProfile | null>(null);

  // Realtime social collections
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [friendProfiles, setFriendProfiles] = useState<
    Record<string, PlayerProfile>
  >({});
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<GameInvite[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<GameInvite[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<UserBlock[]>([]);

  // Player Search
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Feedback & inline confirmations
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);
  const [confirmBlockUid, setConfirmBlockUid] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Force re-evaluate staleness every 20 seconds without touching Firestore
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setClockTick((n) => n + 1), 20_000);
    return () => window.clearInterval(t);
  }, []);

  // Subscriptions
  useEffect(() => {
    if (!user?.uid) return;

    const unsubMe = subscribeToMyPlayerProfile(user.uid, (profile) => {
      if (profile) {
        setMyProfile(profile);
      }
    });
    const unsubFriends = subscribeToFriendships(user.uid, setFriendships);
    const unsubReqs = subscribeToFriendRequests(
      user.uid,
      ({ incoming, outgoing }) => {
        setIncomingRequests(incoming);
        setOutgoingRequests(outgoing);
      }
    );
    const unsubInvs = subscribeToGameInvites(
      user.uid,
      ({ incoming, outgoing }) => {
        setIncomingInvites(incoming);
        setOutgoingInvites(outgoing);
      }
    );
    const unsubBlocks = subscribeToBlockedUsers(user.uid, setBlockedUsers);

    return () => {
      unsubMe();
      unsubFriends();
      unsubReqs();
      unsubInvs();
      unsubBlocks();
    };
  }, [user?.uid]);

  // Subscribe to all friends' live profiles & presence
  useEffect(() => {
    if (!user?.uid) return;
    const friendUids = friendships.map((f) =>
      f.user1 === user.uid ? f.user2 : f.user1
    );
    return subscribeToPlayerProfiles(friendUids, setFriendProfiles);
  }, [friendships, user?.uid]);

  const showSuccess = (text: string) => {
    setFeedbackBanner({ type: 'success', text });
  };
  const showError = (text: string) => {
    setFeedbackBanner({ type: 'error', text });
  };

  // Resolved friend list with live presence status
  const resolvedFriends = useMemo(() => {
    if (!user?.uid) return [];
    return friendships
      .map((f) => {
        const isUser1 = f.user1 === user.uid;
        const uid = isUser1 ? f.user2 : f.user1;
        const fallbackName = isUser1 ? f.user2Name : f.user1Name;
        const fallbackPhoto = isUser1 ? f.user2PhotoURL : f.user1PhotoURL;
        const profile = friendProfiles[uid];
        const status: PresenceStatus = resolveEffectivePresence(profile);

        return {
          friendshipId: f.id,
          uid,
          displayName: profile?.displayName || fallbackName || 'لاعب نِزال',
          photoURL: profile?.photoURL || fallbackPhoto || '',
          status,
          currentRoomCode:
            status === 'in_lobby' || status === 'in_match'
              ? profile?.currentRoomCode || null
              : null,
          acceptsInvites: profile ? profile.acceptsInvites !== false : true,
          createdAt: f.createdAt,
        };
      })
      .sort((a, b) => {
        const aOnline = a.status !== 'offline' ? 0 : 1;
        const bOnline = b.status !== 'offline' ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return a.displayName.localeCompare(b.displayName, 'ar');
      });
  }, [friendships, friendProfiles, user?.uid]);

  const onlineFriends = useMemo(
    () => resolvedFriends.filter((f) => f.status !== 'offline'),
    [resolvedFriends]
  );
  const offlineFriends = useMemo(
    () => resolvedFriends.filter((f) => f.status === 'offline'),
    [resolvedFriends]
  );

  const displayedFriends = useMemo(() => {
    const base =
      presenceFilter === 'online'
        ? onlineFriends
        : presenceFilter === 'offline'
        ? offlineFriends
        : resolvedFriends;

    const q = friendFilterText.trim().toLowerCase();
    if (!q) return base;
    return base.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [
    presenceFilter,
    onlineFriends,
    offlineFriends,
    resolvedFriends,
    friendFilterText,
  ]);

  const friendUidSet = useMemo(
    () => new Set(resolvedFriends.map((f) => f.uid)),
    [resolvedFriends]
  );
  const blockedUidSet = useMemo(
    () => new Set(blockedUsers.map((b) => b.blockedUid)),
    [blockedUsers]
  );
  const outgoingReqUidSet = useMemo(
    () => new Set(outgoingRequests.map((r) => r.toUid)),
    [outgoingRequests]
  );
  const incomingReqMap = useMemo(() => {
    const map = new Map<string, FriendRequest>();
    incomingRequests.forEach((r) => map.set(r.fromUid, r));
    return map;
  }, [incomingRequests]);

  // Search players handler
  const handleSearchPlayers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    if (!searchInput.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    setFeedbackBanner(null);
    try {
      const results = await searchPlayersByUsername(searchInput, user.uid);
      setSearchResults(results);
      setHasSearched(true);
    } catch (err: any) {
      showError(err?.message || 'حدث خطأ أثناء البحث عن اللاعبين');
    } finally {
      setSearching(false);
    }
  };

  // Send friend request
  const handleSendFriendRequest = async (target: PlayerProfile) => {
    if (!user) return;
    setBusyAction(`add_${target.uid}`);
    setFeedbackBanner(null);
    try {
      await sendFriendRequest(user, target);
      showSuccess(`تم إرسال طلب صداقة إلى ${target.displayName}`);
    } catch (err: any) {
      showError(err?.message || 'تعذر إرسال طلب الصداقة');
    } finally {
      setBusyAction(null);
    }
  };

  // Accept / Reject / Cancel Friend Requests
  const handleAcceptRequest = async (req: FriendRequest) => {
    if (!user) return;
    setBusyAction(`acc_req_${req.id}`);
    setFeedbackBanner(null);
    try {
      await acceptFriendRequest(user, req);
      showSuccess(`أصبحتما أصدقاء مع ${req.fromName || 'اللاعب'}!`);
    } catch (err: any) {
      showError(err?.message || 'تعذر قبول طلب الصداقة');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRejectRequest = async (req: FriendRequest) => {
    if (!user) return;
    setBusyAction(`rej_req_${req.id}`);
    try {
      await rejectFriendRequest(user, req);
      showSuccess('تم رفض طلب الصداقة');
    } catch (err: any) {
      showError(err?.message || 'تعذر رفض الطلب');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelRequest = async (req: FriendRequest) => {
    if (!user) return;
    setBusyAction(`can_req_${req.id}`);
    try {
      await cancelFriendRequest(user, req);
      showSuccess('تم إلغاء طلب الصداقة');
    } catch (err: any) {
      showError(err?.message || 'تعذر إلغاء الطلب');
    } finally {
      setBusyAction(null);
    }
  };

  // Invite friend to play or spectate (uses active room if in one, otherwise creates one automatically)
  const handleInviteFriend = async (
    friend: { uid: string; displayName: string },
    inviteType: GameInviteType
  ) => {
    if (!user) return;
    setBusyAction(`inv_${friend.uid}_${inviteType}`);
    setFeedbackBanner(null);

    try {
      let targetRoomCode = activeOnlineRoomCode?.trim().toUpperCase() || '';
      let createdNewRoom = false;
      let createdRoomSnapshot: OnlineGameRoom | null = null;

      if (!targetRoomCode) {
        const hostName =
          user.displayName || user.email?.split('@')[0] || 'لاعب نِزال';
        const room = await createOnlineRoom({
          hostName,
          user,
          teamCount: 2,
          timerDuration: 60,
        });
        targetRoomCode = room.code;
        createdRoomSnapshot = room;
        createdNewRoom = true;
      }

      await sendGameInvite({
        fromUser: user,
        toPlayer: { uid: friend.uid, displayName: friend.displayName },
        roomCode: targetRoomCode,
        inviteType,
        roomSnapshot: createdRoomSnapshot,
      });

      if (createdNewRoom) {
        onEnterRoom(targetRoomCode, 'player');
      } else {
        showSuccess(
          inviteType === 'play'
            ? `تم إرسال دعوة اللعب إلى ${friend.displayName} (غرفة ${targetRoomCode})`
            : `تم إرسال دعوة المشاهدة إلى ${friend.displayName} (غرفة ${targetRoomCode})`
        );
      }
    } catch (err: any) {
      showError(
        formatSocialErrorMessage(
          err,
          'تعذر إرسال الدعوة لهذا الصديق. يرجى التحقق من الاتصال وحالة الغرفة.'
        )
      );
    } finally {
      setBusyAction(null);
    }
  };

  // Accept / Reject / Cancel Game Invite
  const handleAcceptInvite = async (inv: GameInvite) => {
    if (!user) return;
    setBusyAction(`acc_inv_${inv.id}`);
    setFeedbackBanner(null);
    try {
      const res = await acceptGameInvite(user, inv);
      onEnterRoom(
        res.roomCode,
        res.inviteType === 'spectate' ? 'spectator' : 'player'
      );
    } catch (err: any) {
      showError(formatSocialErrorMessage(err, 'تعذر قبول الدعوة.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRejectInvite = async (inv: GameInvite) => {
    if (!user) return;
    setBusyAction(`rej_inv_${inv.id}`);
    try {
      await rejectGameInvite(user, inv);
      showSuccess('تم رفض الدعوة');
    } catch (err: any) {
      showError(formatSocialErrorMessage(err, 'تعذر رفض الدعوة.'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelInvite = async (inv: GameInvite) => {
    if (!user) return;
    setBusyAction(`can_inv_${inv.id}`);
    try {
      await cancelGameInvite(user, inv);
      showSuccess('تم إلغاء الدعوة المرسلة');
    } catch (err: any) {
      showError(formatSocialErrorMessage(err, 'تعذر إلغاء الدعوة.'));
    } finally {
      setBusyAction(null);
    }
  };

  // Remove friend / Block / Unblock / Toggle invites
  const handleRemoveFriend = async (friendUid: string, displayName: string) => {
    if (!user) return;
    setBusyAction(`rem_${friendUid}`);
    try {
      await removeFriend(user, friendUid);
      setConfirmRemoveUid(null);
      showSuccess(`تمت إزالة ${displayName} من قائمة الأصدقاء`);
    } catch (err: any) {
      showError(err?.message || 'تعذر إزالة الصديق');
    } finally {
      setBusyAction(null);
    }
  };

  const handleBlockUser = async (
    targetUid: string,
    targetName: string,
    targetPhotoURL?: string
  ) => {
    if (!user) return;
    setBusyAction(`blk_${targetUid}`);
    try {
      await blockUser(user, targetUid, targetName, targetPhotoURL);
      setConfirmBlockUid(null);
      showSuccess(`تم حظر ${targetName}`);
    } catch (err: any) {
      showError(err?.message || 'تعذر حظر المستخدم');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnblockUser = async (targetUid: string, targetName?: string) => {
    if (!user) return;
    setBusyAction(`unblk_${targetUid}`);
    try {
      await unblockUser(user, targetUid);
      showSuccess(`تم إلغاء حظر ${targetName || 'المستخدم'}`);
    } catch (err: any) {
      showError(err?.message || 'تعذر إلغاء الحظر');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleAcceptsInvites = async () => {
    if (!user) return;
    const nextValue = !(myProfile ? myProfile.acceptsInvites !== false : true);
    setBusyAction('toggle_invites');
    try {
      await updateAcceptsInvitesSetting(user.uid, nextValue);
      showSuccess(
        nextValue
          ? 'تم تفعيل استقبال دعوات اللعب والمشاهدة'
          : 'تم إيقاف استقبال دعوات اللعب والمشاهدة مؤقتاً'
      );
    } catch (err: any) {
      showError(err?.message || 'تعذر تحديث إعداد الدعوات');
    } finally {
      setBusyAction(null);
    }
  };

  // Sign-in gate
  if (!user) {
    return (
      <div className="max-w-[700px] mx-auto px-3 sm:px-6 py-8 md:py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-[#EAF2EE] border border-[#14543D]/15 text-[#14543D] flex items-center justify-center mx-auto">
          <Users className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl md:text-3xl font-bold text-[#1B1F1C]">
            قائمة الأصدقاء والدعوات
          </h1>
          <p className="text-sm text-[#52574E] max-w-md mx-auto">
            سجّل الدخول لإضافة أصدقائك، متابعة حالتهم المباشرة، ودعوتهم للعب أو مشاهدة مبارياتك أونلاين.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenAuthModal}
            className={`${UI_CLASSES.btnGreen} w-full sm:w-auto px-7 min-h-[46px] rounded-2xl`}
          >
            تسجيل الدخول / حساب جديد
          </button>
          <button
            type="button"
            onClick={onNavigateHome}
            className={`${UI_CLASSES.btnOutline} w-full sm:w-auto px-6 min-h-[46px] rounded-2xl text-[#52574E]`}
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  const acceptsInvites = myProfile ? myProfile.acceptsInvites !== false : true;
  const totalRequestsCount = incomingRequests.length + outgoingRequests.length;
  const totalInvitesCount = incomingInvites.length + outgoingInvites.length;

  const renderPresenceBadge = (status: PresenceStatus, roomCode?: string | null) => {
    const dotClass =
      status === 'online'
        ? 'bg-emerald-500'
        : status === 'in_lobby'
        ? 'bg-sky-500'
        : status === 'in_match'
        ? 'bg-[#F07842]'
        : 'bg-[#666B62]/45';
    const textClass =
      status === 'online'
        ? 'text-emerald-700'
        : status === 'in_lobby'
        ? 'text-sky-700'
        : status === 'in_match'
        ? 'text-[#D9602B]'
        : 'text-[#666B62]';

    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${textClass}`}>
          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
          <span>{formatPresenceLabel(status)}</span>
        </span>
        {roomCode && (status === 'in_lobby' || status === 'in_match') && (
          <StatusBadge tone="green" className="font-mono text-[11px] py-0.5 px-2">
            غرفة {roomCode}
          </StatusBadge>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[1220px] mx-auto px-3 sm:px-6 py-5 md:py-10 space-y-6 md:space-y-8">
      {/* TOP PAGE HEADER + PRIVACY TOGGLE */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E5E8DD] pb-6">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] text-xs font-bold text-[#52574E] hover:text-[#14543D] cursor-pointer mb-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
            <span>العودة للرئيسية</span>
          </button>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-[#1B1F1C]">
            الأصدقاء واللعب الجماعي
          </h1>
          <p className="text-sm text-[#52574E]">
            ابحث عن اللاعبين باسم المستخدم، تابع حالة أصدقائك المباشرة، وأرسل دعوات اللعب أو المشاهدة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeOnlineRoomCode && (
            <button
              type="button"
              onClick={() => onEnterRoom(activeOnlineRoomCode, 'player')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#EAF2EE] border border-[#14543D]/25 text-xs font-bold text-[#14543D] hover:bg-[#DDECE4] flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Radio className="w-4 h-4 text-[#F07842]" />
              <span>غرفتك الحالية: <span className="font-mono">{activeOnlineRoomCode}</span></span>
            </button>
          )}

          <button
            type="button"
            disabled={busyAction === 'toggle_invites'}
            onClick={handleToggleAcceptsInvites}
            className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              acceptsInvites
                ? 'bg-[#FFFFFF] border-[#E5E8DD] text-[#14543D] hover:border-[#14543D]'
                : 'bg-[#FEF2EC] border-[#F07842]/40 text-[#D9602B]'
            }`}
          >
            {acceptsInvites ? (
              <>
                <ShieldCheck className="w-4 h-4 text-[#14543D]" />
                <span>استقبال الدعوات: مفعّل</span>
              </>
            ) : (
              <>
                <ShieldOff className="w-4 h-4 text-[#F07842]" />
                <span>استقبال الدعوات: متوقف</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* CLEAN UNBOXED SUMMARY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 border-b border-[#E5E8DD] pb-5 sm:pb-6">
        <div>
          <div className="text-xs font-medium text-[#52574E]">إجمالي الأصدقاء</div>
          <div className="font-display text-3xl font-bold text-[#1B1F1C] tabular-nums mt-1">
            {resolvedFriends.length}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-[#52574E]">المتصلون الآن</div>
          <div className="font-display text-3xl font-bold text-[#14543D] tabular-nums mt-1">
            {onlineFriends.length}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-[#52574E]">غير المتصلين</div>
          <div className="font-display text-3xl font-bold text-[#666B62] tabular-nums mt-1">
            {offlineFriends.length}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-[#52574E]">طلبات ودعوات واردة</div>
          <div className="font-display text-3xl font-bold text-[#F07842] tabular-nums mt-1">
            {incomingRequests.length + incomingInvites.length}
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {feedbackBanner && (
        <AlertBanner
          tone={feedbackBanner.type === 'success' ? 'success' : 'error'}
          onDismiss={() => setFeedbackBanner(null)}
        >
          {feedbackBanner.text}
        </AlertBanner>
      )}

      {/* MAIN TWO-COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* RIGHT / PRIMARY COLUMN (8 cols): TABS & LISTS */}
        <div className="lg:col-span-8 space-y-5">
          {/* Navigation Tabs */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('friends')}
              className={`px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors flex items-center gap-2 ${
                activeTab === 'friends'
                  ? 'bg-[#14543D] text-white'
                  : 'bg-[#FFFFFF] border border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>الأصدقاء</span>
              <span className="tabular-nums opacity-85">({resolvedFriends.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors flex items-center gap-2 ${
                activeTab === 'requests'
                  ? 'bg-[#14543D] text-white'
                  : 'bg-[#FFFFFF] border border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C]'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>طلبات الصداقة</span>
              {totalRequestsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] tabular-nums">
                  {totalRequestsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('invites')}
              className={`px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors flex items-center gap-2 ${
                activeTab === 'invites'
                  ? 'bg-[#14543D] text-white'
                  : 'bg-[#FFFFFF] border border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C]'
              }`}
            >
              <BellRing className="w-4 h-4" />
              <span>الدعوات</span>
              {totalInvitesCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] tabular-nums">
                  {totalInvitesCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('blocked')}
              className={`px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors flex items-center gap-2 ${
                activeTab === 'blocked'
                  ? 'bg-[#14543D] text-white'
                  : 'bg-[#FFFFFF] border border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C]'
              }`}
            >
              <Ban className="w-4 h-4" />
              <span>المحظورون</span>
              <span className="tabular-nums opacity-85">({blockedUsers.length})</span>
            </button>
          </div>

          {/* TAB 1: FRIENDS LIST */}
          {activeTab === 'friends' && (
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-5 md:p-6 space-y-5 shadow-xs">
              {/* Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: `الكل (${resolvedFriends.length})` },
                      { id: 'online', label: `متصلون (${onlineFriends.length})` },
                      { id: 'offline', label: `غير متصلين (${offlineFriends.length})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPresenceFilter(f.id)}
                      className={`min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors tabular-nums ${
                        presenceFilter === f.id
                          ? 'bg-[#EAF2EE] text-[#14543D]'
                          : 'text-[#52574E] hover:bg-[#F7F8F1]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#666B62]" />
                  <input
                    type="text"
                    value={friendFilterText}
                    onChange={(e) => setFriendFilterText(e.target.value)}
                    placeholder="تصفية الأصدقاء..."
                    aria-label="تصفية الأصدقاء"
                    className="w-full min-h-[40px] pr-9 pl-3 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] focus:bg-white focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 text-xs font-bold text-[#1B1F1C] placeholder:text-[#666B62] outline-none transition-colors"
                  />
                </div>
              </div>

              {displayedFriends.length === 0 ? (
                <EmptyState
                  icon={<Users className="w-6 h-6" />}
                  title={
                    resolvedFriends.length === 0
                      ? 'قائمة أصدقائك فارغة حالياً'
                      : 'لا يوجد أصدقاء ضمن هذا التصنيف'
                  }
                  description="استخدم مربع البحث لإيجاد اللاعبين وإرسال طلبات الصداقة."
                  className="border-0 py-8"
                />
              ) : (
                <div className="divide-y divide-[#E5E8DD]">
                  {displayedFriends.map((friend) => (
                    <div
                      key={friend.uid}
                      className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {friend.photoURL ? (
                          <img
                            src={friend.photoURL}
                            alt={friend.displayName}
                            className="w-11 h-11 rounded-2xl object-cover border border-[#E5E8DD] shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-2xl bg-[#14543D] text-white flex items-center justify-center font-display text-base font-bold shrink-0">
                            {friend.displayName[0]?.toUpperCase() || 'ن'}
                          </div>
                        )}
                        <div className="min-w-0 space-y-1">
                          <div className="font-display text-sm font-bold text-[#1B1F1C] truncate">
                            {friend.displayName}
                          </div>
                          {renderPresenceBadge(friend.status, friend.currentRoomCode)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {confirmRemoveUid === friend.uid ? (
                          <div className="flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                            <span className="text-xs font-bold text-rose-800">
                              تأكيد الإزالة؟
                            </span>
                            <button
                              type="button"
                              disabled={busyAction === `rem_${friend.uid}`}
                              onClick={() =>
                                handleRemoveFriend(friend.uid, friend.displayName)
                              }
                              className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition-colors"
                            >
                              نعم
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveUid(null)}
                              className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-white border border-[#E5E8DD] text-[#52574E] text-xs font-bold cursor-pointer transition-colors"
                            >
                              لا
                            </button>
                          </div>
                        ) : confirmBlockUid === friend.uid ? (
                          <div className="flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                            <span className="text-xs font-bold text-rose-800">
                              حظر وإزالة؟
                            </span>
                            <button
                              type="button"
                              disabled={busyAction === `blk_${friend.uid}`}
                              onClick={() =>
                                handleBlockUser(
                                  friend.uid,
                                  friend.displayName,
                                  friend.photoURL
                                )
                              }
                              className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer transition-colors"
                            >
                              حظر
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmBlockUid(null)}
                              className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-white border border-[#E5E8DD] text-[#52574E] text-xs font-bold cursor-pointer transition-colors"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={
                                !friend.acceptsInvites ||
                                busyAction === `inv_${friend.uid}_play`
                              }
                              onClick={() => handleInviteFriend(friend, 'play')}
                              title={
                                friend.acceptsInvites
                                  ? 'إرسال دعوة للعب أونلاين'
                                  : 'أوقف هذا اللاعب استقبال الدعوات'
                              }
                              className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] disabled:opacity-45 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>دعوة للعب</span>
                            </button>

                            <button
                              type="button"
                              disabled={
                                !friend.acceptsInvites ||
                                busyAction === `inv_${friend.uid}_spectate`
                              }
                              onClick={() =>
                                handleInviteFriend(friend, 'spectate')
                              }
                              title={
                                friend.acceptsInvites
                                  ? 'إرسال دعوة لمشاهدة المباراة'
                                  : 'أوقف هذا اللاعب استقبال الدعوات'
                              }
                              className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[#F7F8F1] hover:bg-[#E5E8DD] disabled:opacity-45 text-[#1B1F1C] border border-[#E5E8DD] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#F07842]" />
                              <span>دعوة للمشاهدة</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setConfirmBlockUid(null);
                                setConfirmRemoveUid(friend.uid);
                              }}
                              title="إزالة الصديق"
                              aria-label={`إزالة ${friend.displayName} من الأصدقاء`}
                              className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border border-[#E5E8DD] text-[#52574E] hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setConfirmRemoveUid(null);
                                setConfirmBlockUid(friend.uid);
                              }}
                              title="حظر المستخدم"
                              aria-label={`حظر ${friend.displayName}`}
                              className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl border border-[#E5E8DD] text-[#52574E] hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FRIEND REQUESTS (INCOMING & OUTGOING) */}
          {activeTab === 'requests' && (
            <div className="space-y-5">
              {/* Incoming Requests */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-5 md:p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
                  <h2 className="font-display text-base font-bold text-[#1B1F1C]">
                    طلبات الصداقة الواردة ({incomingRequests.length})
                  </h2>
                </div>

                {incomingRequests.length === 0 ? (
                  <p className="text-xs text-[#666B62] py-6 text-center">
                    لا توجد طلبات صداقة واردة حالياً.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E5E8DD]">
                    {incomingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#EAF2EE] text-[#14543D] flex items-center justify-center font-bold text-sm shrink-0">
                            {(req.fromName || 'ن')[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#1B1F1C] truncate">
                              {req.fromName || 'لاعب نِزال'}
                            </div>
                            <div className="text-[11px] text-[#52574E]">
                              يريد إضافتك إلى قائمة أصدقائه
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={busyAction === `acc_req_${req.id}`}
                            onClick={() => handleAcceptRequest(req)}
                            className="px-3.5 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>قبول</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyAction === `rej_req_${req.id}`}
                            onClick={() => handleRejectRequest(req)}
                            className="px-3.5 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] hover:bg-rose-50 hover:border-rose-200 text-[#52574E] hover:text-rose-700 text-xs font-bold cursor-pointer transition-colors"
                          >
                            رفض
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing Requests */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-5 md:p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
                  <h2 className="font-display text-base font-bold text-[#1B1F1C]">
                    طلبات الصداقة المرسلة ({outgoingRequests.length})
                  </h2>
                </div>

                {outgoingRequests.length === 0 ? (
                  <p className="text-xs text-[#666B62] py-6 text-center">
                    لا توجد طلبات صداقة مرسلة بانتظار الرد.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E5E8DD]">
                    {outgoingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] text-[#1B1F1C] flex items-center justify-center font-bold text-sm shrink-0">
                            {(req.toName || 'ن')[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#1B1F1C] truncate">
                              {req.toName || 'لاعب نِزال'}
                            </div>
                            <div className="text-[11px] text-[#52574E] inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>بانتظار الموافقة</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={busyAction === `can_req_${req.id}`}
                          onClick={() => handleCancelRequest(req)}
                          className="px-3.5 py-2 min-h-[44px] sm:min-h-[40px] self-start sm:self-center rounded-xl border border-[#E5E8DD] hover:bg-rose-50 hover:border-rose-200 text-xs font-bold text-[#52574E] hover:text-rose-700 cursor-pointer shrink-0 transition-colors"
                        >
                          إلغاء الطلب
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PLAY & SPECTATOR INVITES */}
          {activeTab === 'invites' && (
            <div className="space-y-5">
              {/* Incoming Invites */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-5 md:p-6 space-y-4 shadow-xs">
                <h2 className="font-display text-base font-bold text-[#1B1F1C] border-b border-[#E5E8DD] pb-3">
                  دعوات اللعب والمشاهدة الواردة ({incomingInvites.length})
                </h2>

                {incomingInvites.length === 0 ? (
                  <p className="text-xs text-[#666B62] py-6 text-center">
                    لا توجد دعوات واردة نشطة حالياً.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E5E8DD]">
                    {incomingInvites.map((inv) => {
                      const isSpectate = inv.inviteType === 'spectate';
                      return (
                        <div
                          key={inv.id}
                          className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <StatusBadge tone={isSpectate ? 'green' : 'orange'}>
                                {isSpectate ? 'دعوة للمشاهدة' : 'دعوة للعب'}
                              </StatusBadge>
                              <span className="text-sm font-bold text-[#1B1F1C]">
                                {inv.fromName || 'صديق'}
                              </span>
                            </div>
                            <div className="text-xs text-[#52574E]">
                              رمز الغرفة:{' '}
                              <span className="font-mono font-bold text-[#14543D]">
                                {inv.roomCode}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busyAction === `acc_inv_${inv.id}`}
                              onClick={() => handleAcceptInvite(inv)}
                              className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              {isSpectate ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>دخول للمشاهدة</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5" />
                                  <span>انضمام للغرفة</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={busyAction === `rej_inv_${inv.id}`}
                              onClick={() => handleRejectInvite(inv)}
                              className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] hover:bg-rose-50 hover:border-rose-200 text-[#52574E] hover:text-rose-700 text-xs font-bold cursor-pointer transition-colors"
                            >
                              رفض
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Outgoing Invites */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-5 md:p-6 space-y-4 shadow-xs">
                <h2 className="font-display text-base font-bold text-[#1B1F1C] border-b border-[#E5E8DD] pb-3">
                  الدعوات التي أرسلتها ({outgoingInvites.length})
                </h2>

                {outgoingInvites.length === 0 ? (
                  <p className="text-xs text-[#666B62] py-6 text-center">
                    لا توجد دعوات مرسلة نشطة حالياً.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E5E8DD]">
                    {outgoingInvites.map((inv) => (
                      <div
                        key={inv.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="text-sm font-bold text-[#1B1F1C]">
                            إلى: {inv.toName || 'صديق'}
                          </div>
                          <div className="text-xs text-[#52574E]">
                            {inv.inviteType === 'spectate' ? 'مشاهدة' : 'لعب'} • غرفة{' '}
                            <span className="font-mono font-bold text-[#14543D]">
                              {inv.roomCode}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={busyAction === `can_inv_${inv.id}`}
                          onClick={() => handleCancelInvite(inv)}
                          className="px-3.5 py-2 min-h-[44px] sm:min-h-[40px] self-start sm:self-center rounded-xl border border-[#E5E8DD] hover:bg-rose-50 hover:border-rose-200 text-xs font-bold text-[#52574E] hover:text-rose-700 cursor-pointer shrink-0 transition-colors"
                        >
                          إلغاء الدعوة
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: BLOCKED USERS */}
          {activeTab === 'blocked' && (
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-5 md:p-6 space-y-4 shadow-xs">
              <h2 className="font-display text-base font-bold text-[#1B1F1C] border-b border-[#E5E8DD] pb-3">
                الحسابات المحظورة ({blockedUsers.length})
              </h2>

              {blockedUsers.length === 0 ? (
                <p className="text-xs text-[#666B62] py-8 text-center">
                  لم تقم بحظر أي حساب.
                </p>
              ) : (
                <div className="divide-y divide-[#E5E8DD]">
                  {blockedUsers.map((blk) => (
                    <div
                      key={blk.id}
                      className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-xs shrink-0">
                          <Ban className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#1B1F1C] truncate">
                            {blk.blockedName || 'مستخدم'}
                          </div>
                          <div className="text-[11px] text-[#52574E]">
                            لا يمكنه إرسال طلبات صداقة أو دعوات لك
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busyAction === `unblk_${blk.blockedUid}`}
                        onClick={() =>
                          handleUnblockUser(blk.blockedUid, blk.blockedName)
                        }
                        className="px-3.5 py-2 min-h-[44px] sm:min-h-[40px] self-start sm:self-center rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] hover:bg-[#EAF2EE] text-xs font-bold text-[#14543D] flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>إلغاء الحظر</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* LEFT / SECONDARY COLUMN (4 cols): PLAYER USERNAME SEARCH */}
        <aside className="lg:col-span-4 bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-5 md:p-6 space-y-5 shadow-xs">
          <div className="space-y-1 border-b border-[#E5E8DD] pb-4">
            <div className="flex items-center gap-2 text-[#14543D]">
              <UserPlus className="w-4 h-4 text-[#F07842]" />
              <h2 className="font-display text-base font-bold text-[#1B1F1C]">
                البحث عن لاعبين
              </h2>
            </div>
            <p className="text-xs text-[#52574E]">
              ابحث باسم المستخدم لإرسال طلب صداقة دون كشف أي بيانات شخصية.
            </p>
          </div>

          <form onSubmit={handleSearchPlayers} className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[#666B62]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="اكتب اسم المستخدم..."
                aria-label="البحث عن لاعب باسم المستخدم"
                className="w-full min-h-[44px] pr-10 pl-4 py-2.5 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] focus:bg-white focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 text-xs font-bold text-[#1B1F1C] placeholder:text-[#666B62] outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !searchInput.trim()}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              {searching ? 'جاري البحث...' : 'بحث عن لاعب'}
            </button>
          </form>

          {/* Search Results */}
          {hasSearched && (
            <div className="space-y-2.5 pt-2 border-t border-[#E5E8DD]">
              <div className="text-[11px] font-bold text-[#52574E] tabular-nums">
                نتائج البحث ({searchResults.length})
              </div>

              {searchResults.length === 0 ? (
                <p className="text-xs text-[#666B62] py-6 text-center">
                  لم يتم العثور على لاعبين بهذا الاسم.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto">
                  {searchResults.map((player) => {
                    const isFriend = friendUidSet.has(player.uid);
                    const isBlocked = blockedUidSet.has(player.uid);
                    const isOutgoingPending = outgoingReqUidSet.has(player.uid);
                    const incomingReq = incomingReqMap.get(player.uid);
                    const status = resolveEffectivePresence(player);

                    return (
                      <div
                        key={player.uid}
                        className="p-3 rounded-2xl border border-[#E5E8DD] bg-[#F7F8F1] flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-[#14543D] text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {player.displayName[0]?.toUpperCase() || 'ن'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#1B1F1C] truncate">
                              {player.displayName}
                            </div>
                            <div className="text-[10px] text-[#52574E]">
                              {formatPresenceLabel(status)}
                            </div>
                          </div>
                        </div>

                        {isBlocked ? (
                          <StatusBadge tone="danger" className="shrink-0">
                            محظور
                          </StatusBadge>
                        ) : isFriend ? (
                          <StatusBadge tone="green" className="shrink-0">
                            صديق ✓
                          </StatusBadge>
                        ) : incomingReq ? (
                          <button
                            type="button"
                            disabled={busyAction === `acc_req_${incomingReq.id}`}
                            onClick={() => handleAcceptRequest(incomingReq)}
                            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-[11px] font-bold cursor-pointer shrink-0 transition-colors"
                          >
                            قبول الطلب
                          </button>
                        ) : isOutgoingPending ? (
                          <StatusBadge tone="neutral" className="shrink-0">
                            تم الإرسال
                          </StatusBadge>
                        ) : (
                          <button
                            type="button"
                            disabled={busyAction === `add_${player.uid}`}
                            onClick={() => handleSendFriendRequest(player)}
                            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>إضافة صديق</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
