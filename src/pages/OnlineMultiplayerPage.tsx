import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import confetti from 'canvas-confetti';
import {
  Users,
  Copy,
  Check,
  Share2,
  Crown,
  Play,
  RotateCcw,
  LogOut,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
  Trophy,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  UserX,
  Volume2,
  VolumeX,
  Radio,
  Eye,
  BellRing,
  Hand,
  Layers,
  ChevronDown,
  Search,
  X,
  CheckCircle2,
  Lock,
  Flame,
} from 'lucide-react';
import {
  ActiveQuestionState,
  OnlineGameRoom,
  PlayerRequest,
  RoomPlayer,
  RoomTeam,
} from '../types/multiplayer';
import {
  MainCategoryMeta,
  PageView,
  PointValue,
  SubcategoryItem,
  TriviaQuestion,
} from '../types/game';
import {
  assignPlayerTeam,
  claimOnlineHost,
  createOnlineRoom,
  DEFAULT_ONLINE_TEAMS,
  getOrCreatePlayerProfile,
  hostAwardPoints,
  hostCloseActiveQuestion,
  hostFinishGame,
  hostKickPlayer,
  hostMarkTileNoPoints,
  hostRestartGame,
  hostRevealAnswer,
  hostSelectQuestion,
  hostStartGame,
  hostUpdateTeams,
  joinOnlineRoom,
  joinOnlineRoomAsSpectator,
  leaveOnlineRoom,
  leaveOnlineRoomAsSpectator,
  playerSendOnlineRequest,
  savePlayerName,
  subscribeToOnlineRoom,
  toggleOnlineSubcategoryPick,
  updateOnlinePlayerPresence,
  updateOnlineSpectatorPresence,
} from '../services/multiplayerService';
import { TEAM_COLOR_OPTIONS, DEFAULT_SUBCATEGORIES } from '../data/categoriesAndSeed';
import { CategoryCardArtwork } from '../components/CategoryCardArtwork';
import { InviteFriendsModal } from '../components/InviteFriendsModal';
import { saveMatchProgressToFirestore } from '../services/matchService';
import { soundFX } from '../services/soundEffects';

interface OnlineMultiplayerPageProps {
  user: User | null;
  mainCategories: MainCategoryMeta[];
  subcategories: SubcategoryItem[];
  approvedQuestions: TriviaQuestion[];
  onNavigateHome: () => void;
  onNavigate?: (page: PageView) => void;
  onOpenAuthModal?: () => void;
  initialRoomCode?: string | null;
  initialJoinRole?: 'player' | 'spectator';
  autoJoinNonce?: number;
  onPresenceActivityChange?: (
    status: 'online' | 'in_lobby' | 'in_match',
    roomCode?: string | null
  ) => void;
}

const POINT_TIERS: PointValue[] = [100, 200, 300, 400, 500];

export const OnlineMultiplayerPage: React.FC<OnlineMultiplayerPageProps> = ({
  user,
  mainCategories,
  subcategories,
  approvedQuestions,
  onNavigateHome,
  onNavigate,
  onOpenAuthModal,
  initialRoomCode,
  initialJoinRole = 'player',
  autoJoinNonce = 0,
  onPresenceActivityChange,
}) => {
  // Local profile & session
  const [playerProfile, setPlayerProfile] = useState(() =>
    getOrCreatePlayerProfile(user)
  );

  // View mode inside multiplayer: 'entry' | 'room'
  const [entryMode, setEntryMode] = useState<'create' | 'join'>('create');
  const [roomCodeInput, setRoomCodeInput] = useState<string>(
    initialRoomCode ? initialRoomCode.toUpperCase() : ''
  );
  const [playerNameInput, setPlayerNameInput] = useState<string>(
    playerProfile.name || ''
  );

  // Create room options
  const [teamCount, setTeamCount] = useState<number>(2);
  const [timerDuration, setTimerDuration] = useState<number>(60);
  const [customTeams, setCustomTeams] = useState<
    { name: string; color: string }[]
  >(
    DEFAULT_ONLINE_TEAMS.slice(0, 2).map((t) => ({
      name: t.name,
      color: t.color,
    }))
  );

  // Active room state
  const [currentRoom, setCurrentRoom] = useState<OnlineGameRoom | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [toastNotification, setToastNotification] = useState<string | null>(
    null
  );

  // Category selection & search states
  const [categoryFilterMainId, setCategoryFilterMainId] = useState<string>('all');
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [isTogglingSubId, setIsTogglingSubId] = useState<string | null>(null);
  const [joinRole, setJoinRole] = useState<'player' | 'spectator'>(initialJoinRole);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState<boolean>(false);

  // Question Timer State (synced from openedAt)
  const [modalTimeLeft, setModalTimeLeft] = useState<number>(60);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    soundFX.isEnabled()
  );

  // Ref to active subscription & previous room state for live SFX triggers
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const prevModalTimeLeftRef = useRef<number>(60);
  const prevRoomSyncRef = useRef<{
    code: string;
    status: string;
    openedAt: number | null;
    isAnswerRevealed: boolean;
    lastActionAt: number;
    totalScore: number;
    teamScores: number[];
  } | null>(null);

  useEffect(() => {
    return soundFX.subscribe(setSoundEnabled);
  }, []);

  // Sync player profile with user changes
  useEffect(() => {
    const p = getOrCreatePlayerProfile(user);
    setPlayerProfile(p);
    if (!playerNameInput) {
      setPlayerNameInput(p.name);
    }
  }, [user]);

  // Handle URL room code parameter on load
  useEffect(() => {
    if (initialRoomCode && initialRoomCode.trim()) {
      setRoomCodeInput(initialRoomCode.trim().toUpperCase());
      setJoinRole(initialJoinRole || 'player');
      setEntryMode('join');
    }
  }, [initialRoomCode, initialJoinRole]);

  // Adjust custom teams array when teamCount changes
  useEffect(() => {
    setCustomTeams((prev) => {
      const result: { name: string; color: string }[] = [];
      for (let i = 0; i < teamCount; i++) {
        if (prev[i]) {
          result.push(prev[i]);
        } else {
          const fallback = DEFAULT_ONLINE_TEAMS[i] || {
            name: `الفريق ${i + 1}`,
            color: TEAM_COLOR_OPTIONS[i % TEAM_COLOR_OPTIONS.length].hex,
          };
          result.push({ name: fallback.name, color: fallback.color });
        }
      }
      return result;
    });
  }, [teamCount]);

  // Confetti on game finished
  useEffect(() => {
    if (currentRoom?.status === 'finished') {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#14543D', '#F07842', '#F3F5E9', '#FFFFFF'],
        });
      } catch {
        // ignore
      }
    }
  }, [currentRoom?.status]);

  // Active question countdown timer (anchored to room.activeQuestion.openedAt)
  useEffect(() => {
    if (!currentRoom?.activeQuestion) {
      prevModalTimeLeftRef.current = currentRoom?.timerDuration || 60;
      return;
    }
    const qDuration = currentRoom.timerDuration || 60;
    const openedAt = currentRoom.activeQuestion.openedAt || Date.now();

    const updateTimer = () => {
      const elapsedSeconds = Math.floor((Date.now() - openedAt) / 1000);
      const remaining = Math.max(0, qDuration - elapsedSeconds);
      setModalTimeLeft(remaining);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 500);
    return () => window.clearInterval(interval);
  }, [currentRoom?.activeQuestion, currentRoom?.timerDuration]);

  // Timer tick & time-up sound effects for Online Multiplayer
  useEffect(() => {
    const q = currentRoom?.activeQuestion;
    if (!q || q.isAnswerRevealed) {
      prevModalTimeLeftRef.current = modalTimeLeft;
      return;
    }
    if (prevModalTimeLeftRef.current > 0 && modalTimeLeft === 0) {
      soundFX.playTimeUp();
    } else if (
      prevModalTimeLeftRef.current !== modalTimeLeft &&
      modalTimeLeft > 0 &&
      modalTimeLeft <= 5
    ) {
      soundFX.playTimerTick();
    }
    prevModalTimeLeftRef.current = modalTimeLeft;
  }, [modalTimeLeft, currentRoom?.activeQuestion]);

  // Synchronized real-time sound effects across all connected devices in the room
  useEffect(() => {
    if (!currentRoom) {
      prevRoomSyncRef.current = null;
      return;
    }

    const teamScores = (currentRoom.teams || []).map((t) => t.score || 0);
    const totalScore = teamScores.reduce((sum, s) => sum + s, 0);
    const currentSnapshot = {
      code: currentRoom.code,
      status: currentRoom.status,
      openedAt: currentRoom.activeQuestion?.openedAt || null,
      isAnswerRevealed: Boolean(currentRoom.activeQuestion?.isAnswerRevealed),
      lastActionAt: currentRoom.lastActionAt || 0,
      totalScore,
      teamScores,
    };

    const prev = prevRoomSyncRef.current;
    prevRoomSyncRef.current = currentSnapshot;

    // Skip firing SFX on initial room entry/load
    if (!prev || prev.code !== currentSnapshot.code) {
      return;
    }

    // 1. Challenge Started
    const wasPlaying = prev.status === 'playing' || prev.status === 'in_game';
    const isNowPlaying =
      currentSnapshot.status === 'playing' ||
      currentSnapshot.status === 'in_game';
    if (!wasPlaying && isNowPlaying) {
      soundFX.playChallengeStart();
    }

    // 2. Match Finished / Winner Announced
    const wasFinished =
      prev.status === 'finished' || prev.status === 'completed';
    const isNowFinished =
      currentSnapshot.status === 'finished' ||
      currentSnapshot.status === 'completed';
    if (!wasFinished && isNowFinished) {
      soundFX.playMatchWin();
    }

    // 3. New Question Tile Opened
    if (
      currentSnapshot.openedAt &&
      currentSnapshot.openedAt !== prev.openedAt
    ) {
      soundFX.playTileOpen();
    }

    // 4. Answer Revealed
    if (!prev.isAnswerRevealed && currentSnapshot.isAnswerRevealed) {
      soundFX.playAnswerReveal();
    }

    // 5. Scoring / Wrong / Buzz-in Feedback
    const scoringTeamIdx = teamScores.findIndex(
      (score, idx) => score > (prev.teamScores[idx] ?? 0)
    );
    if (scoringTeamIdx >= 0 && !(!wasFinished && isNowFinished)) {
      soundFX.playTeamScore(scoringTeamIdx);
    } else if (currentSnapshot.lastActionAt !== prev.lastActionAt) {
      const msg = currentRoom.lastActionMessage || '';
      if (currentSnapshot.totalScore > prev.totalScore && !(!wasFinished && isNowFinished)) {
        soundFX.playCorrect();
      } else if (
        msg.includes('تم تخطي السؤال') ||
        msg.includes('بدون نقاط') ||
        msg.includes('إجابة خاطئة')
      ) {
        soundFX.playWrong();
      } else if (msg.includes('رفع يده') || msg.includes('يطلب كشف')) {
        soundFX.playBuzzIn();
      }
    }
  }, [currentRoom]);

  // Toast notifications on lastActionMessage
  useEffect(() => {
    if (currentRoom?.lastActionMessage) {
      setToastNotification(currentRoom.lastActionMessage);
      const timer = window.setTimeout(() => setToastNotification(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [currentRoom?.lastActionAt, currentRoom?.lastActionMessage]);

  // Heartbeat presence listener (Every 10 seconds while in room)
  useEffect(() => {
    if (!currentRoom) return;

    const isRoomSpectator =
      currentRoom.hostId !== playerProfile.id &&
      !currentRoom.players?.[playerProfile.id] &&
      Boolean(currentRoom.spectators?.[playerProfile.id]);

    const ping = () => {
      if (isRoomSpectator) {
        updateOnlineSpectatorPresence(currentRoom.code, playerProfile.id, 'online');
      } else {
        updateOnlinePlayerPresence(currentRoom.code, playerProfile.id, 'online');
      }
    };

    ping(); // Immediate ping on entry
    const interval = window.setInterval(ping, 10000);
    heartbeatRef.current = interval;

    return () => {
      window.clearInterval(interval);
    };
  }, [currentRoom?.code, currentRoom?.hostId, playerProfile.id]);

  // Notify parent app of global presence activity transitions (in_lobby / in_match / online)
  useEffect(() => {
    if (!onPresenceActivityChange) return;
    if (!currentRoom) {
      onPresenceActivityChange('online', null);
      return;
    }
    const isPlayingNow =
      currentRoom.status === 'playing' || currentRoom.status === 'in_game';
    const isEndedNow =
      currentRoom.status === 'finished' || currentRoom.status === 'completed';

    if (isPlayingNow) {
      onPresenceActivityChange('in_match', currentRoom.code);
    } else if (isEndedNow) {
      onPresenceActivityChange('online', null);
    } else {
      onPresenceActivityChange('in_lobby', currentRoom.code);
    }
  }, [currentRoom?.code, currentRoom?.status, onPresenceActivityChange]);

  // Auto-join room when triggered from accepted Friend Invite or Notification Center
  useEffect(() => {
    if (!user || !autoJoinNonce || !initialRoomCode) return;
    const cleanCode = initialRoomCode.trim().toUpperCase();
    if (!cleanCode) return;

    let cancelled = false;
    const displayName =
      playerNameInput.trim() ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'لاعب نِزال';

    setLoading(true);
    setErrorMsg(null);
    savePlayerName(displayName);

    const runAutoJoin = async () => {
      try {
        if (initialJoinRole === 'spectator') {
          const { room } = await joinOnlineRoomAsSpectator({
            code: cleanCode,
            spectatorName: displayName,
            user,
          });
          if (cancelled) return;
          setPlayerProfile(getOrCreatePlayerProfile(user, displayName));
          setCurrentRoom(room);
          connectToRoomStream(room.code);
        } else {
          const { room } = await joinOnlineRoom({
            code: cleanCode,
            playerName: displayName,
            user,
          });
          if (cancelled) return;
          setPlayerProfile(getOrCreatePlayerProfile(user, displayName));
          setCurrentRoom(room);
          connectToRoomStream(room.code);
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'تعذر الدخول إلى الغرفة تلقائياً.');
          setEntryMode('join');
          setRoomCodeInput(cleanCode);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void runAutoJoin();
    return () => {
      cancelled = true;
    };
  }, [autoJoinNonce]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
      }
      if (onPresenceActivityChange) {
        onPresenceActivityChange('online', null);
      }
    };
  }, []);

  // Pre-index approved questions by subcategory and points for O(1) instant board lookups
  const questionsBySlotMap = useMemo(() => {
    const map = new Map<string, TriviaQuestion>();
    for (const q of approvedQuestions) {
      if (q.subcategoryId) {
        const idKey = `${q.subcategoryId}__${q.points}`;
        if (!map.has(idKey)) map.set(idKey, q);
      }
      const nameKey = `${q.category.trim()}__${q.points}`;
      if (!map.has(nameKey)) map.set(nameKey, q);
    }
    return map;
  }, [approvedQuestions]);

  const findQuestionForTile = useCallback(
    (subId: string, subName: string, points: PointValue): TriviaQuestion | null => {
      const idKey = `${subId}__${points}`;
      const foundById = questionsBySlotMap.get(idKey);
      if (foundById) return foundById;

      const nameKey = `${subName.trim()}__${points}`;
      const foundByName = questionsBySlotMap.get(nameKey);
      if (foundByName) return foundByName;

      return (
        approvedQuestions.find(
          (q) =>
            (q.subcategoryId === subId || q.category === subName) &&
            q.points === points
        ) || null
      );
    },
    [questionsBySlotMap, approvedQuestions]
  );

  // Active subcategories that belong to active main categories
  const activeSubcategories = useMemo(() => {
    const visibleMainCategoryIds = new Set(
      mainCategories.filter((m) => m.isActive && !m.isDeleted).map((m) => m.id)
    );
    const visibleMainCategoryNames = new Set(
      mainCategories.filter((m) => m.isActive && !m.isDeleted).map((m) => m.name)
    );
    return subcategories.filter(
      (s) =>
        s.isActive &&
        !s.isDeleted &&
        ((s.mainCategoryId && visibleMainCategoryIds.has(s.mainCategoryId)) ||
          visibleMainCategoryNames.has(s.mainCategory))
    );
  }, [subcategories, mainCategories]);

  const comingSoonMainIds = useMemo(
    () => new Set(mainCategories.filter((m) => m.isComingSoon).map((m) => m.id)),
    [mainCategories]
  );
  const comingSoonMainNames = useMemo(
    () => new Set(mainCategories.filter((m) => m.isComingSoon).map((m) => m.name)),
    [mainCategories]
  );

  const isSubComingSoon = (sub: SubcategoryItem) =>
    Boolean(
      sub.isComingSoon ||
        (sub.mainCategoryId && comingSoonMainIds.has(sub.mainCategoryId)) ||
        comingSoonMainNames.has(sub.mainCategory)
    );

  const triggerComingSoonAlert = () => {
    const msg = 'هذه الفئة قادمة قريباً، ترقبوا!';
    setErrorMsg(msg);
    setToastNotification(msg);
    window.setTimeout(() => {
      setToastNotification((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Connect to room stream
  const connectToRoomStream = (roomCode: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    const unsub = subscribeToOnlineRoom(
      roomCode,
      (updatedRoom) => {
        if (!updatedRoom) {
          setErrorMsg('تم إغلاق الغرفة أو أنها لم تعد متوفرة.');
          setCurrentRoom(null);
          return;
        }
        setCurrentRoom(updatedRoom);

        // Auto-save progress to user's match history (only for active players, never spectators)
        if (
          user &&
          updatedRoom.players?.[playerProfile.id] &&
          (updatedRoom.status === 'playing' ||
            updatedRoom.status === 'in_game' ||
            updatedRoom.status === 'finished')
        ) {
          const sorted = [...updatedRoom.teams].sort((a, b) => b.score - a.score);
          const playersList = Object.values(updatedRoom.players || {});
          saveMatchProgressToFirestore({
            id: `online_${updatedRoom.code}_${user.uid}`,
            userId: user.uid,
            userEmail: user.email || null,
            status: updatedRoom.status === 'finished' ? 'completed' : 'in_progress',
            mode: 'online',
            roomCode: updatedRoom.code,
            teams: updatedRoom.teams.map((t) => ({
              id: t.id,
              name: t.name,
              color: t.color,
              score: t.score,
              players: playersList
                .filter((p) => p.teamId === t.id)
                .map((p) => p.name),
            })),
            selectedSubcategories: updatedRoom.selectedSubcategoryIds || [],
            usedTileKeys: updatedRoom.usedTileKeys || [],
            activeTeamIndex: updatedRoom.activeTeamIndex || 0,
            activeQuestionState: updatedRoom.activeQuestion
              ? {
                  tileKey: updatedRoom.activeQuestion.tileKey,
                  subcategoryId: updatedRoom.activeQuestion.subcategoryId,
                  subcategoryName: updatedRoom.activeQuestion.subcategoryName,
                  mainCategoryName: updatedRoom.activeQuestion.category,
                  points: (updatedRoom.activeQuestion.points as any) || 100,
                  questionId: updatedRoom.activeQuestion.questionId,
                  questionText: updatedRoom.activeQuestion.questionText,
                  correctAnswer: updatedRoom.activeQuestion.correctAnswer,
                  imageUrl: updatedRoom.activeQuestion.imageUrl,
                  imageDescription: updatedRoom.activeQuestion.imageDescription,
                  explanation: updatedRoom.activeQuestion.explanation,
                  answerRevealed: updatedRoom.activeQuestion.isAnswerRevealed,
                  timeLeft: updatedRoom.timerDuration || 60,
                  timerPaused: false,
                }
              : null,
            winnerTeamName:
              updatedRoom.status === 'finished' ? sorted[0]?.name : undefined,
            winnerScore:
              updatedRoom.status === 'finished' ? sorted[0]?.score : undefined,
          }).catch(() => {});
        }
      },
      (err) => {
        console.error('Room subscription error:', err);
        setErrorMsg('حدث خطأ أثناء مزامنة الغرفة. جاري المحاولة مجدداً...');
      }
    );
    unsubscribeRef.current = unsub;
  };

  // 1. Handle Create Room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);

    let name = playerNameInput.trim();
    if (!name) {
      name = user?.displayName || user?.email?.split('@')[0] || '';
      if (name) {
        setPlayerNameInput(name);
      }
    }
    if (!name) {
      setErrorMsg('يرجى إدخال اسمك أولاً لإنشاء الغرفة');
      return;
    }

    setLoading(true);
    savePlayerName(name);

    try {
      const newRoom = await createOnlineRoom({
        hostName: name,
        user,
        teamCount,
        timerDuration,
        customTeams,
      });

      setPlayerProfile(getOrCreatePlayerProfile(user, name));
      setCurrentRoom(newRoom);
      connectToRoomStream(newRoom.code);
    } catch (err: any) {
      console.error('Failed to create room:', err);
      setErrorMsg(err.message || 'فشل إنشاء الغرفة. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Handle Join Room
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);

    let name = playerNameInput.trim();
    if (!name) {
      name = user?.displayName || user?.email?.split('@')[0] || '';
      if (name) {
        setPlayerNameInput(name);
      }
    }
    const code = roomCodeInput.trim().toUpperCase();

    if (!name) {
      setErrorMsg('يرجى إدخال اسمك أولاً');
      return;
    }
    if (!code || code.length < 5) {
      setErrorMsg('يرجى إدخال رمز غرفة صحيح مكون من 6 خانات');
      return;
    }

    setLoading(true);
    savePlayerName(name);

    try {
      if (joinRole === 'spectator') {
        const { room } = await joinOnlineRoomAsSpectator({
          code,
          spectatorName: name,
          user,
        });
        setPlayerProfile(getOrCreatePlayerProfile(user, name));
        setCurrentRoom(room);
        connectToRoomStream(room.code);
      } else {
        const { room } = await joinOnlineRoom({
          code,
          playerName: name,
          user,
        });
        setPlayerProfile(getOrCreatePlayerProfile(user, name));
        setCurrentRoom(room);
        connectToRoomStream(room.code);
      }
    } catch (err: any) {
      console.error('Failed to join room:', err);
      setErrorMsg(err.message || 'تعذر الانضمام إلى الغرفة. تحقق من صحة الرمز.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Leave Room
  const handleLeaveRoom = async () => {
    if (!currentRoom) return;
    const isCurrentlySpectator =
      currentRoom.hostId !== playerProfile.id &&
      !currentRoom.players?.[playerProfile.id] &&
      Boolean(currentRoom.spectators?.[playerProfile.id]);

    try {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (isCurrentlySpectator) {
        await leaveOnlineRoomAsSpectator(currentRoom.code, playerProfile.id);
      } else {
        await leaveOnlineRoom(currentRoom.code, playerProfile.id);
      }
    } catch {
      // ignore
    } finally {
      setCurrentRoom(null);
      if (onPresenceActivityChange) {
        onPresenceActivityChange('online', null);
      }
    }
  };

  // 4. Handle Copy Room Code & Share
  const handleCopyCode = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareInviteLink = () => {
    if (!currentRoom) return;
    const origin = window.location.origin;
    const shareUrl = `${origin}?room=${currentRoom.code}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // 5. Player Toggles Category Pick (Each team picks 3 subcategories)
  const handleToggleCategoryPick = async (subcategoryId: string) => {
    if (!currentRoom) return;
    const matchedSub = activeSubcategories.find((s) => s.id === subcategoryId);
    const matchedMain = mainCategories.find(
      (m) => m.id === subcategoryId || m.name === subcategoryId
    );
    if ((matchedSub && isSubComingSoon(matchedSub)) || matchedMain?.isComingSoon) {
      triggerComingSoonAlert();
      return;
    }
    if (
      currentRoom.status === 'playing' ||
      currentRoom.status === 'in_game' ||
      currentRoom.status === 'completed' ||
      currentRoom.status === 'finished'
    ) {
      setErrorMsg('لا يمكن تعديل الفئات بعد بدء المباراة');
      return;
    }

    const myPlayer = currentRoom.players?.[playerProfile.id];
    const myTeamId =
      myPlayer?.teamId ||
      (isHost ? currentRoom.teams[0]?.id : currentRoom.teams[1]?.id);

    if (!myTeamId) {
      setErrorMsg('يرجى الانضمام إلى فريق أولاً لاختيار الفئات.');
      return;
    }

    // Check if player's team already has 3 picks and this is an add
    const currentTeamPicks = currentRoom.teamSubcategoryIds?.[myTeamId] || [];
    if (!currentTeamPicks.includes(subcategoryId) && currentTeamPicks.length >= 3) {
      setErrorMsg('لقد اخترت الحد الأقصى (3 فئات) لفريقك. أزل إحدى الفئات أولاً لاختيار غيرها.');
      return;
    }

    setErrorMsg(null);
    setIsTogglingSubId(subcategoryId);

    try {
      await toggleOnlineSubcategoryPick(
        currentRoom.code,
        playerProfile.id,
        myTeamId,
        subcategoryId
      );
    } catch (err: any) {
      console.error('Error toggling category pick:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء تعديل اختيار الفئة.');
    } finally {
      setIsTogglingSubId(null);
    }
  };

  // 6. Host starts game after validating all 5 conditions
  const handleHostStartGameClick = async () => {
    if (!currentRoom || !isHost) return;
    if (loading) return;

    const playersList = Object.values(currentRoom.players || {});
    if (playersList.length < 2) {
      setErrorMsg('بانتظار دخول المنافس لمتابعة بدء التحدي');
      return;
    }

    const t1Id = currentRoom.teams[0]?.id || 'team_1';
    const t2Id = currentRoom.teams[1]?.id || 'team_2';
    const t1Picks = currentRoom.teamSubcategoryIds?.[t1Id] || [];
    const t2Picks = currentRoom.teamSubcategoryIds?.[t2Id] || [];

    if (t1Picks.length !== 3) {
      setErrorMsg(`فريق ${currentRoom.teams[0]?.name || 'المضيف'} يحتاج لاختيار 3 فئات (تم اختيار ${t1Picks.length})`);
      return;
    }

    if (t2Picks.length !== 3) {
      setErrorMsg(`فريق ${currentRoom.teams[1]?.name || 'المنافس'} يحتاج لاختيار 3 فئات (تم اختيار ${t2Picks.length})`);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const mergedSubcategoryIds = [...t1Picks, ...t2Picks];
      await hostStartGame(
        currentRoom.code,
        currentRoom.hostId,
        mergedSubcategoryIds,
        currentRoom.teamSubcategoryIds
      );
    } catch (err: any) {
      console.error('Error starting game:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء بدء المباراة. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  // 6. Host Select Tile to open question modal
  const handleHostTileClick = async (
    subId: string,
    subName: string,
    points: PointValue,
    tileKey: string
  ) => {
    if (!currentRoom || !isHost) return;
    if (currentRoom.usedTileKeys.includes(tileKey)) return;

    const matchedQ = findQuestionForTile(subId, subName, points);
    if (!matchedQ) {
      setErrorMsg('لا يتوفر سؤال مخصص لهذه الخانة حالياً.');
      return;
    }

    const payload: ActiveQuestionState = {
      tileKey,
      questionId: matchedQ.id,
      subcategoryId: subId,
      subcategoryName: subName,
      category: matchedQ.category,
      points,
      difficulty: matchedQ.difficulty,
      questionText: matchedQ.questionText,
      correctAnswer: matchedQ.correctAnswer,
      imageUrl: matchedQ.imageUrl || '',
      imageDescription: matchedQ.imageDescription || '',
      explanation: matchedQ.explanation || '',
      isAnswerRevealed: false,
      openedAt: Date.now(),
      openedByHostId: currentRoom.hostId,
    };

    try {
      await hostSelectQuestion(currentRoom.code, currentRoom.hostId, payload);
    } catch (err) {
      console.error('Failed to open question for all players:', err);
    }
  };

  // 7. Host Award Points
  const handleHostAward = async (awardedTeamIndex: number) => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion) return;
    const { tileKey, questionId, points } = currentRoom.activeQuestion;
    const totalTiles = currentRoom.selectedSubcategoryIds.length * 5;

    try {
      await hostAwardPoints({
        code: currentRoom.code,
        hostId: currentRoom.hostId,
        awardedTeamIndex,
        points,
        tileKey,
        questionId,
        totalPlayableTiles: totalTiles,
      });
    } catch (err) {
      console.error('Failed to award points:', err);
    }
  };

  // 8. Host Skip Question
  const handleHostSkip = async () => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion) return;
    const { tileKey, questionId } = currentRoom.activeQuestion;
    const totalTiles = currentRoom.selectedSubcategoryIds.length * 5;

    try {
      await hostMarkTileNoPoints({
        code: currentRoom.code,
        hostId: currentRoom.hostId,
        tileKey,
        questionId,
        totalPlayableTiles: totalTiles,
      });
    } catch (err) {
      console.error('Failed to skip question:', err);
    }
  };

  // 9. Host Reveal Answer
  const handleHostReveal = async () => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion) return;
    try {
      await hostRevealAnswer(currentRoom.code, currentRoom.hostId);
    } catch (err) {
      console.error('Failed to reveal answer:', err);
    }
  };

  // 10. Player sends request / buzz in
  const handlePlayerBuzz = async (type: 'reveal_answer' | 'buzz_in') => {
    if (!currentRoom) return;
    const msg =
      type === 'reveal_answer'
        ? 'يطلب كشف الإجابة 📢'
        : 'رفع يده ومستعد للإجابة! ✋';

    const req: PlayerRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      playerId: playerProfile.id,
      playerName: playerProfile.name,
      teamId: currentRoom.players[playerProfile.id]?.teamId,
      type,
      message: msg,
      timestamp: Date.now(),
    };

    await playerSendOnlineRequest(currentRoom.code, req);
  };

  // Computed state
  const isHost = currentRoom ? currentRoom.hostId === playerProfile.id : false;
  const currentHostPlayer = currentRoom ? currentRoom.players[currentRoom.hostId] : null;
  const isHostOffline =
    currentHostPlayer &&
    (currentHostPlayer.connectionStatus === 'offline' ||
      Date.now() - (currentHostPlayer.lastSeen || 0) > 35000);

  const playersList = useMemo(() => {
    return currentRoom ? Object.values(currentRoom.players) : [];
  }, [currentRoom]);

  const myPlayer = currentRoom?.players ? currentRoom.players[playerProfile.id] : undefined;
  const isSpectator = Boolean(
    currentRoom &&
      !isHost &&
      !myPlayer &&
      currentRoom.spectators?.[playerProfile.id]
  );
  const spectatorsList = useMemo(() => {
    return currentRoom?.spectators ? Object.values(currentRoom.spectators) : [];
  }, [currentRoom?.spectators]);
  const myTeamId = isSpectator
    ? null
    : myPlayer?.teamId ||
      (isHost ? currentRoom?.teams[0]?.id : currentRoom?.teams[1]?.id);

  const myTeam = isSpectator
    ? null
    : currentRoom?.teams.find((t) => t.id === myTeamId) || currentRoom?.teams[0];
  const team1 = currentRoom?.teams[0] || { id: 'team_1', name: 'فريق 1', color: '#14543D', score: 0 };
  const team2 = currentRoom?.teams[1] || { id: 'team_2', name: 'فريق 2', color: '#F07842', score: 0 };

  const team1Picks = (currentRoom?.teamSubcategoryIds && currentRoom.teamSubcategoryIds[team1.id]) || [];
  const team2Picks = (currentRoom?.teamSubcategoryIds && currentRoom.teamSubcategoryIds[team2.id]) || [];

  const hasOpponent = playersList.length >= 2;
  const isCategoriesComplete = team1Picks.length === 3 && team2Picks.length === 3;
  const isRoomReadyToStart = hasOpponent && isCategoriesComplete;

  // Filtered subcategories for interactive lobby picker
  const filteredSubcategories = useMemo(() => {
    return activeSubcategories.filter((sub) => {
      // Main category filter
      if (categoryFilterMainId !== 'all') {
        const parentMain = mainCategories.find(
          (m) => m.id === categoryFilterMainId || m.name === categoryFilterMainId
        );
        const matchesMain =
          (sub.mainCategoryId && sub.mainCategoryId === categoryFilterMainId) ||
          (parentMain && sub.mainCategory === parentMain.name);
        if (!matchesMain) return false;
      }

      // Search query filter
      if (categorySearchQuery.trim()) {
        const q = categorySearchQuery.trim().toLowerCase();
        const matchesName = (sub.name || '').toLowerCase().includes(q);
        const matchesMain = (sub.mainCategory || '').toLowerCase().includes(q);
        if (!matchesName && !matchesMain) return false;
      }

      return true;
    });
  }, [activeSubcategories, categoryFilterMainId, categorySearchQuery, mainCategories]);

  // Coming Soon main categories with 0 subcategories (e.g., ولا كلمة) displayed in online lobby picker
  const filteredComingSoonMainCards = useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    return mainCategories.filter((m) => {
      if (!m.isActive || m.isDeleted || !m.isComingSoon) return false;
      const hasSubs = activeSubcategories.some(
        (s) => s.mainCategoryId === m.id || s.mainCategory === m.name
      );
      if (hasSubs) return false;
      if (
        categoryFilterMainId !== 'all' &&
        categoryFilterMainId !== m.id &&
        categoryFilterMainId !== m.name
      ) {
        return false;
      }
      if (q) {
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesDesc = (m.description || m.tagline || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [mainCategories, activeSubcategories, categoryFilterMainId, categorySearchQuery]);

  const activeTurnTeam = useMemo(() => {
    if (!currentRoom || currentRoom.teams.length === 0) return null;
    return currentRoom.teams[currentRoom.activeTeamIndex % currentRoom.teams.length];
  }, [currentRoom]);

  // Board columns resolved from selectedSubcategoryIds
  const onlineBoardColumns = useMemo(() => {
    if (!currentRoom || !currentRoom.selectedSubcategoryIds) return [];
    return currentRoom.selectedSubcategoryIds.map((subId) => {
      const subObj =
        subcategories.find((s) => s.id === subId) ||
        subcategories.find((s) => s.name === subId);
      const parentMain =
        mainCategories.find(
          (m) =>
            (subObj?.mainCategoryId && m.id === subObj.mainCategoryId) ||
            m.name === subObj?.mainCategory
        ) ||
        mainCategories[0];

      // Identify which team chose this subcategory
      let owningTeam = currentRoom.teams[0];
      for (const t of currentRoom.teams) {
        const teamPicks = currentRoom.teamSubcategoryIds?.[t.id] || [];
        if (teamPicks.includes(subId)) {
          owningTeam = t;
          break;
        }
      }

      return {
        subId: subObj?.id || subId,
        subName: subObj?.name || 'تصنيف',
        teamName: owningTeam?.name || '',
        teamColor: owningTeam?.color || '#14543D',
        mainCategoryName: parentMain?.name || '',
        accentColor: parentMain?.accentColor || '#14543D',
        bgTint: parentMain?.bgTint || '#EAF2EE',
        borderTint: parentMain?.borderTint || '#14543D',
        iconName: parentMain?.iconName || 'compass',
      };
    });
  }, [currentRoom, subcategories, mainCategories]);

  // Total playable tiles
  const totalPlayableTiles = onlineBoardColumns.length * 5;
  const usedCount = currentRoom?.usedTileKeys?.length || 0;

  // Mandatory Login Gate for Online Multiplayer
  if (!user) {
    return (
      <div className="max-w-[700px] mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-[#FEF2EC] border border-[#F07842]/20 text-[#F07842] flex items-center justify-center mx-auto">
          <Radio className="w-8 h-8 animate-pulse text-[#F07842]" />
        </div>
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-full bg-[#EAF2EE] text-xs font-bold text-[#14543D]">
            تسجيل الدخول إلزامي
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
            اللعب عن بُعد يتطلب تسجيل الدخول
          </h1>
          <p className="text-sm text-[#777B73] max-w-md mx-auto">
            لإنشاء غرفة أو الانضمام إلى مباراة أونلاين وحفظ تقدمك ونتائجك، يرجى تسجيل الدخول إلى حسابك أو إنشاء حساب جديد.
          </p>
        </div>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="px-8 py-3.5 rounded-2xl bg-[#14543D] text-[#FFFFFF] text-sm font-bold hover:bg-[#0E3D2C] cursor-pointer shadow-sm transition-all"
          >
            تسجيل الدخول / إنشاء حساب
          </button>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-6 py-3.5 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#777B73] hover:text-[#252824] text-sm font-bold hover:bg-[#F3F5E9] cursor-pointer transition-colors"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: 1. ENTRY SCREEN (Create or Join Room)
  // -------------------------------------------------------------
  if (!currentRoom) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 py-8 md:py-12 space-y-8">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAF2EE] border border-[#14543D]/20 text-xs font-bold text-[#14543D]">
              <Radio className="w-3.5 h-3.5 animate-pulse text-[#F07842]" />
              <span>اللعب عن بُعد • Online Multiplayer</span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
              تحدّوا بعض أونلاين من أجهزتكم المختلفة!
            </h1>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-4 py-2 text-xs font-bold text-[#777B73] hover:text-[#252824] bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl hover:bg-[#F3F5E9] transition-colors cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <p className="font-bold">{errorMsg}</p>
          </div>
        )}

        {/* Tab Selection: Create vs Join */}
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto p-1.5 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl">
          <button
            type="button"
            onClick={() => {
              setEntryMode('create');
              setErrorMsg(null);
            }}
            className={`py-3 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              entryMode === 'create'
                ? 'bg-[#14543D] text-[#FFFFFF] shadow-sm'
                : 'text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9]'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>إنشاء غرفة جديدة</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEntryMode('join');
              setErrorMsg(null);
            }}
            className={`py-3 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              entryMode === 'join'
                ? 'bg-[#14543D] text-[#FFFFFF] shadow-sm'
                : 'text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>الانضمام إلى غرفة</span>
          </button>
        </div>

        {/* FORM: CREATE ROOM */}
        {entryMode === 'create' && (
          <form
            onSubmit={handleCreateRoom}
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 md:p-10 max-w-xl mx-auto space-y-6 shadow-sm"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/20 text-[#14543D] flex items-center justify-center mx-auto">
                <Crown className="w-7 h-7" />
              </div>
              <h2 className="font-display text-xl font-bold text-[#252824]">
                إنشاء غرفة تحدي أونلاين
              </h2>
              <p className="text-xs text-[#777B73]">
                ستحصل على رمز فريد مكون من 6 خانات لمشاركته مع أصدقائك.
              </p>
            </div>

            {/* Host Player Name */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                اسمك (المضيف):
              </label>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="مثال: سعود، نورة، أبو فهد..."
                className="w-full px-4 py-3 rounded-xl border border-[#E5E8DD] focus:border-[#14543D] focus:ring-2 focus:ring-[#14543D]/10 outline-none text-sm font-bold text-[#252824]"
                required
              />
            </div>

            {/* Teams Count (2 to 4) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                عدد الفرق المتنافسة:
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setTeamCount(count)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      teamCount === count
                        ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                        : 'border-[#E5E8DD] text-[#777B73] hover:bg-[#F3F5E9]'
                    }`}
                  >
                    {count} فرق
                  </button>
                ))}
              </div>
            </div>

            {/* Teams Customization */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-[#252824]">
                تسمية الفرق:
              </label>
              <div className="space-y-2.5">
                {customTeams.map((team, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD]"
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: team.color }}
                    />
                    <input
                      type="text"
                      value={team.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomTeams((prev) =>
                          prev.map((t, i) => (i === idx ? { ...t, name: val } : t))
                        );
                      }}
                      className="flex-1 bg-transparent border-none text-xs font-bold text-[#252824] outline-none"
                      placeholder={`فريق ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Question Timer Duration */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                وقت الإجابة على السؤال:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[30, 45, 60, 90].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTimerDuration(sec)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      timerDuration === sec
                        ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                        : 'border-[#E5E8DD] text-[#777B73] hover:bg-[#F3F5E9]'
                    }`}
                  >
                    {sec} ثانية
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 text-base font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3D2C] active:scale-[0.99] rounded-2xl transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جاري إنشاء الغرفة...</span>
                </div>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-[#F07842]" />
                  <span>إنشاء الغرفة وبدء التحدي</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* FORM: JOIN ROOM */}
        {entryMode === 'join' && (
          <form
            onSubmit={handleJoinRoom}
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 md:p-10 max-w-xl mx-auto space-y-6 shadow-sm"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[#FEF2EC] border border-[#F07842]/20 text-[#F07842] flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <h2 className="font-display text-xl font-bold text-[#252824]">
                الانضمام إلى غرفة موجودة
              </h2>
              <p className="text-xs text-[#777B73]">
                أدخل رمز الغرفة المكون من 6 خانات الذي أرسله لك المضيف.
              </p>
            </div>

            {/* Room Code */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                رمز الغرفة (6 خانات):
              </label>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) =>
                  setRoomCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                maxLength={6}
                placeholder="مثال: NZL849"
                className="w-full px-4 py-3.5 rounded-xl border-2 border-[#E5E8DD] focus:border-[#F07842] outline-none text-center font-mono text-2xl font-bold tracking-widest text-[#14543D] uppercase"
                required
              />
            </div>

            {/* Player Name */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                اسمك المعروض:
              </label>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="اكتب اسمك للمباراة..."
                className="w-full px-4 py-3 rounded-xl border border-[#E5E8DD] focus:border-[#14543D] focus:ring-2 focus:ring-[#14543D]/10 outline-none text-sm font-bold text-[#252824]"
                required
              />
            </div>

            {/* Join Role: Player vs Spectator */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                طريقة الدخول للغرفة:
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setJoinRole('player')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    joinRole === 'player'
                      ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                      : 'border-[#E5E8DD] text-[#777B73] hover:bg-[#F3F5E9]'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>دخول كلاعب</span>
                </button>
                <button
                  type="button"
                  onClick={() => setJoinRole('spectator')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    joinRole === 'spectator'
                      ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                      : 'border-[#E5E8DD] text-[#777B73] hover:bg-[#F3F5E9]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>دخول كمشاهد (للعرض فقط)</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || roomCodeInput.length < 5}
              className="w-full py-4 text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-2xl transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جاري الاتصال بالغرفة...</span>
                </div>
              ) : (
                <>
                  {joinRole === 'spectator' ? (
                    <Eye className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                  <span>
                    {joinRole === 'spectator' ? 'دخول للمشاهدة' : 'دخول الغرفة'}
                  </span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: 2. LOBBY & CATEGORY SELECTION SCREEN (شاشة انتظار اللاعبين واختيار الفئات)
  // -------------------------------------------------------------
  const isLobbyOrSelecting =
    currentRoom.status === 'waiting_for_opponent' ||
    currentRoom.status === 'selecting_categories' ||
    currentRoom.status === 'ready' ||
    currentRoom.status === 'lobby' ||
    (currentRoom.status as string) === 'waiting';

  if (isLobbyOrSelecting) {
    const myTeamPicks =
      (myTeamId && currentRoom.teamSubcategoryIds && currentRoom.teamSubcategoryIds[myTeamId]) || [];

    const getSubcategoryById = (id: string) => {
      return (
        subcategories.find((s) => s.id === id) ||
        subcategories.find((s) => s.name === id) ||
        DEFAULT_SUBCATEGORIES.find((s) => s.id === id) || {
          id,
          name: id,
          mainCategory: 'عام',
          iconName: 'help-circle',
        }
      );
    };

    return (
      <div className="max-w-[1150px] mx-auto px-4 py-8 space-y-8">
        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <p className="font-bold">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-500 hover:text-rose-700 text-xs font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Toast Alert */}
        {toastNotification && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#14543D] text-[#FFFFFF] px-5 py-2.5 rounded-2xl shadow-lg border border-[#FFFFFF]/20 text-xs font-bold flex items-center gap-2 animate-bounce">
            <BellRing className="w-4 h-4 text-[#F07842]" />
            <span>{toastNotification}</span>
          </div>
        )}

        {/* Spectator Read-Only Banner */}
        {isSpectator && (
          <div className="p-4 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/25 text-[#14543D] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Eye className="w-5 h-5 text-[#F07842] shrink-0" />
              <span>أنت تشاهد هذه الغرفة بوضع المشاهد (للعرض فقط — لا يمكنك اختيار الفئات أو التحكم باللعبة).</span>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#14543D]/15 tabular-nums">
              المشاهدون: {spectatorsList.length}
            </span>
          </div>
        )}

        {/* Host Offline Alert / Succession */}
        {isHostOffline && !isHost && !isSpectator && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>المضيف ({currentRoom.hostName}) يبدو غير متصل حالياً. يمكنك استلام دور المضيف لمواصلة المباراة.</span>
            </div>
            <button
              type="button"
              onClick={() => claimOnlineHost(currentRoom.code, playerProfile.id)}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
            >
              استلام دور المضيف 👑
            </button>
          </div>
        )}

        {/* Room Header & Invite Card */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#777B73] flex-wrap">
                <Radio className="w-3.5 h-3.5 text-[#14543D] animate-pulse" />
                <span>غرفة اللعب عن بُعد</span>
                <span>•</span>
                <span className="font-bold text-[#14543D]">
                  المضيف: {currentRoom.hostName}
                </span>
                <span>•</span>
                {isSpectator ? (
                  <span className="font-bold text-[#F07842]">مشاهد (للعرض فقط)</span>
                ) : (
                  <span>
                    أنت في: <strong style={{ color: myTeam?.color }}>{myTeam?.name}</strong>
                  </span>
                )}
                {spectatorsList.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-[#14543D] font-bold tabular-nums">
                      <Eye className="w-3.5 h-3.5" />
                      <span>{spectatorsList.length} مشاهد</span>
                    </span>
                  </>
                )}
              </div>
              <h1 className="font-display text-2xl font-bold text-[#252824]">
                صالة التحدي واختيار الفئات
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isSpectator && (
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(true)}
                  className="px-4 py-2 text-xs font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3D2C] rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4 text-[#F07842]" />
                  <span>دعوة أصدقاء</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>{isSpectator ? 'مغادرة المشاهدة' : 'مغادرة الغرفة'}</span>
              </button>
            </div>
          </div>

          {/* Big Room Code Box */}
          <div className="bg-[#F3F5E9] border-2 border-[#14543D]/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-right">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#777B73]">
                رمز الغرفة (شاركه مع منافسك للانضمام):
              </div>
              <div className="font-mono text-4xl md:text-5xl font-bold tracking-widest text-[#14543D]">
                {currentRoom.code}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-5 py-3 rounded-xl bg-[#FFFFFF] hover:bg-[#EAF2EE] border border-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-4 h-4 text-[#14543D]" />
                    <span>تم نسخ الرمز!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>نسخ الرمز</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleShareInviteLink}
                className="px-5 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-xs font-bold text-[#FFFFFF] flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تم نسخ رابط الدعوة!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>مشاركة رابط الدعوة</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Opponent Status Notice */}
          {!hasOpponent ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3 animate-pulse">
              <Clock className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-sm">بانتظار دخول المنافس...</span>
                <span>لا يمكن بدء التحدي قبل انضمام المنافس إلى الغرفة باستخدام رمز الغرفة أعلاه.</span>
              </div>
            </div>
          ) : isCategoriesComplete ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-sm text-emerald-800">الغرفة جاهزة الآن لبدء التحدي! 🚀</span>
                <span>اكتمل اختيار 3 فئات لكل فريق (6 فئات إجمالاً). يمكن للمضيف إطلاق التحدي الآن.</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-sky-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-sm text-sky-800">المنافس متصل! مرحلة اختيار الفئات 🎯</span>
                <span>
                  كل فريق يختار 3 فئات خاصة به من القائمة أدناه ({team1.name}: {team1Picks.length}/3 • {team2.name}: {team2Picks.length}/3).
                </span>
              </div>
            </div>
          )}
        </div>

        {/* TEAMS AND THEIR 3 SELECTED CATEGORIES */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#14543D]" />
              <h2 className="font-display text-lg font-bold text-[#252824]">
                فئات الفرق (3 فئات لكل فريق • 6 إجمالاً)
              </h2>
            </div>
            <div className="text-xs text-[#777B73]">
              تحديث مباشر متزامن فورياً على الشاشتين
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* TEAM 1 (Host Team) */}
            <div
              className={`bg-[#FFFFFF] border-2 rounded-2xl p-5 space-y-4 transition-all shadow-sm ${
                myTeamId === team1.id ? 'ring-2 ring-[#14543D]/20' : ''
              }`}
              style={{ borderColor: `${team1.color}60` }}
            >
              <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-4 h-4 rounded-full border border-black/10"
                    style={{ backgroundColor: team1.color }}
                  />
                  <span className="font-display font-bold text-base text-[#252824]">
                    {team1.name}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#14543D] text-white">
                    فريق المضيف 👑
                  </span>
                </div>
                <div className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#F3F5E9] text-[#14543D]">
                  {team1Picks.length} / 3 فئات
                </div>
              </div>

              {/* Team 1 Players */}
              <div className="text-xs text-[#777B73] flex items-center gap-2 flex-wrap">
                <span className="font-bold">اللاعبون:</span>
                {playersList
                  .filter((p) => p.teamId === team1.id)
                  .map((p) => (
                    <span
                      key={p.id}
                      className="px-2 py-0.5 rounded-md bg-[#F3F5E9] text-[#252824] font-bold text-[11px]"
                    >
                      {p.name} {p.id === playerProfile.id ? '(أنت)' : ''}
                    </span>
                  ))}
              </div>

              {/* 3 Category Slots for Team 1 */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-bold text-[#777B73]">
                  الفئات المختارة لـ {team1.name}:
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((slotIdx) => {
                    const subId = team1Picks[slotIdx];
                    if (subId) {
                      const subObj = getSubcategoryById(subId);
                      const isMyTeamChoice = myTeamId === team1.id;

                      return (
                        <div
                          key={slotIdx}
                          className="p-2.5 rounded-xl border border-[#14543D]/30 bg-[#EAF2EE] flex flex-col justify-between min-h-[75px] relative group"
                        >
                          <div className="text-[10px] text-[#777B73] line-clamp-1">
                            {subObj.mainCategory || 'فئة'}
                          </div>
                          <div className="font-display text-xs font-bold text-[#14543D] line-clamp-2">
                            {subObj.name}
                          </div>
                          {isMyTeamChoice && (
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryPick(subId)}
                              title="إلغاء اختيار هذه الفئة"
                              className="absolute top-1 left-1 w-5 h-5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={slotIdx}
                        className="p-2.5 rounded-xl border border-dashed border-[#E5E8DD] bg-[#FFFFFF] flex flex-col items-center justify-center text-center min-h-[75px] text-[#777B73]/60"
                      >
                        <span className="text-xs font-bold">فئة {slotIdx + 1}</span>
                        <span className="text-[10px]">فارغة</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* TEAM 2 (Opponent Team) */}
            <div
              className={`bg-[#FFFFFF] border-2 rounded-2xl p-5 space-y-4 transition-all shadow-sm ${
                myTeamId === team2.id ? 'ring-2 ring-[#F07842]/20' : ''
              }`}
              style={{ borderColor: `${team2.color}60` }}
            >
              <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-4 h-4 rounded-full border border-black/10"
                    style={{ backgroundColor: team2.color }}
                  />
                  <span className="font-display font-bold text-base text-[#252824]">
                    {team2.name}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#F07842] text-white">
                    فريق المنافس ⚔️
                  </span>
                </div>
                <div className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#F3F5E9] text-[#F07842]">
                  {team2Picks.length} / 3 فئات
                </div>
              </div>

              {/* Team 2 Players */}
              <div className="text-xs text-[#777B73] flex items-center gap-2 flex-wrap min-h-[22px]">
                <span className="font-bold">اللاعبون:</span>
                {playersList.filter((p) => p.teamId === team2.id).length === 0 ? (
                  <span className="text-amber-600 font-bold text-[11px] animate-pulse">
                    بانتظار انضمام المنافس...
                  </span>
                ) : (
                  playersList
                    .filter((p) => p.teamId === team2.id)
                    .map((p) => (
                      <span
                        key={p.id}
                        className="px-2 py-0.5 rounded-md bg-[#FEF2EC] text-[#252824] font-bold text-[11px]"
                      >
                        {p.name} {p.id === playerProfile.id ? '(أنت)' : ''}
                      </span>
                    ))
                )}
              </div>

              {/* 3 Category Slots for Team 2 */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-bold text-[#777B73]">
                  الفئات المختارة لـ {team2.name}:
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((slotIdx) => {
                    const subId = team2Picks[slotIdx];
                    if (subId) {
                      const subObj = getSubcategoryById(subId);
                      const isMyTeamChoice = myTeamId === team2.id;

                      return (
                        <div
                          key={slotIdx}
                          className="p-2.5 rounded-xl border border-[#F07842]/30 bg-[#FEF2EC] flex flex-col justify-between min-h-[75px] relative group"
                        >
                          <div className="text-[10px] text-[#777B73] line-clamp-1">
                            {subObj.mainCategory || 'فئة'}
                          </div>
                          <div className="font-display text-xs font-bold text-[#F07842] line-clamp-2">
                            {subObj.name}
                          </div>
                          {isMyTeamChoice && (
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryPick(subId)}
                              title="إلغاء اختيار هذه الفئة"
                              className="absolute top-1 left-1 w-5 h-5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={slotIdx}
                        className="p-2.5 rounded-xl border border-dashed border-[#E5E8DD] bg-[#FFFFFF] flex flex-col items-center justify-center text-center min-h-[75px] text-[#777B73]/60"
                      >
                        <span className="text-xs font-bold">فئة {slotIdx + 1}</span>
                        <span className="text-[10px]">فارغة</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* INTERACTIVE CATEGORY SELECTION BROWSER (Hidden for Spectators) */}
        {!isSpectator && (
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF2EE] text-xs font-bold text-[#14543D] mb-1">
                <Sparkles className="w-3.5 h-3.5 text-[#F07842]" />
                <span>دورك: اختر 3 فئات لفريقك ({myTeam?.name})</span>
              </div>
              <h2 className="font-display text-xl font-bold text-[#252824]">
                قائمة الفئات المتاحة في نِزال
              </h2>
              <p className="text-xs text-[#777B73]">
                اضغط على أي فئة لإضافتها أو إزالتها من اختيارات فريقك. يمكنك رؤية اختيارات المنافس في الوقت الفعلي.
              </p>
            </div>

            {/* My Team Pick Counter Badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#777B73]">اختيارات فريقك:</span>
              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-bold text-white ${
                  myTeamPicks.length === 3 ? 'bg-emerald-600' : 'bg-[#14543D]'
                }`}
              >
                {myTeamPicks.length} من 3 فئات
              </span>
            </div>
          </div>

          {/* Search & Main Category Filters */}
          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[#777B73]" />
              <input
                type="text"
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder="ابحث عن فئة معينة..."
                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#E5E8DD] focus:border-[#14543D] text-xs font-bold text-[#252824] outline-none"
              />
              {categorySearchQuery && (
                <button
                  type="button"
                  onClick={() => setCategorySearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#777B73] hover:text-[#252824]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Main Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setCategoryFilterMainId('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                  categoryFilterMainId === 'all'
                    ? 'bg-[#14543D] text-white shadow-xs'
                    : 'bg-[#F3F5E9] text-[#777B73] hover:text-[#252824]'
                }`}
              >
                الكل ({activeSubcategories.length})
              </button>
              {mainCategories
                .filter((m) => m.isActive && !m.isDeleted)
                .map((m) => {
                  const isSelected = categoryFilterMainId === m.id;
                  const isComingSoon = Boolean(m.isComingSoon);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setCategoryFilterMainId(m.id);
                        if (isComingSoon) {
                          triggerComingSoonAlert();
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#14543D] text-white shadow-xs'
                          : isComingSoon
                          ? 'bg-[#FEF2EC]/70 text-[#252824] border border-[#F07842]/35 hover:bg-[#FEF2EC]'
                          : 'bg-[#F3F5E9] text-[#777B73] hover:text-[#252824]'
                      }`}
                    >
                      <span>{m.name}</span>
                      {isComingSoon && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isSelected
                              ? 'bg-[#F07842] text-white'
                              : 'bg-[#F07842]/15 text-[#D9602B]'
                          }`}
                        >
                          قريباً
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Subcategories Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[380px] overflow-y-auto p-1">
            {filteredSubcategories.map((sub) => {
              const comingSoon = isSubComingSoon(sub);
              const isPickedByTeam1 = team1Picks.includes(sub.id);
              const isPickedByTeam2 = team2Picks.includes(sub.id);
              const isPickedByMyTeam = myTeamPicks.includes(sub.id);
              const isMyTeamFull = myTeamPicks.length >= 3;
              const isToggling = isTogglingSubId === sub.id;

              if (comingSoon) {
                return (
                  <button
                    key={sub.id}
                    type="button"
                    aria-disabled="true"
                    onClick={() => triggerComingSoonAlert()}
                    className="p-3 rounded-2xl border-2 border-dashed border-[#D4D9CC] bg-[#F3F5E9]/85 text-right transition-all cursor-not-allowed relative flex flex-col justify-between min-h-[100px] select-none opacity-85 hover:border-[#F07842]/60"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] text-[#777B73] font-bold line-clamp-1">
                          {sub.mainCategory || 'تصنيف'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                          <Clock className="w-2.5 h-2.5" />
                          <span>قريباً</span>
                        </span>
                      </div>

                      <div className="font-display text-xs font-bold text-[#252824] line-clamp-2">
                        {sub.name}
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-[10px] font-bold text-[#D9602B]">
                      <span>غير متاحة حالياً</span>
                      <Lock className="w-3 h-3 text-[#777B73]" />
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={sub.id}
                  type="button"
                  disabled={isToggling}
                  onClick={() => handleToggleCategoryPick(sub.id)}
                  className={`p-3 rounded-2xl border text-right transition-all cursor-pointer relative flex flex-col justify-between min-h-[95px] select-none ${
                    isPickedByMyTeam
                      ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'bg-[#FFFFFF] border-[#E5E8DD] hover:border-[#14543D]/40 hover:bg-[#F3F5E9]/50'
                  }`}
                >
                  <div>
                    {/* Top badging */}
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] text-[#777B73] font-bold line-clamp-1">
                        {sub.mainCategory || 'تصنيف'}
                      </span>
                      {isToggling && (
                        <span className="w-3.5 h-3.5 border-2 border-[#14543D] border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>

                    <div className="font-display text-xs font-bold text-[#252824] line-clamp-2">
                      {sub.name}
                    </div>
                  </div>

                  {/* Badges showing which team picked it */}
                  <div className="pt-2 flex flex-wrap items-center gap-1">
                    {isPickedByTeam1 && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white"
                        style={{ backgroundColor: team1.color }}
                      >
                        {team1.name} ✓
                      </span>
                    )}
                    {isPickedByTeam2 && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white"
                        style={{ backgroundColor: team2.color }}
                      >
                        {team2.name} ✓
                      </span>
                    )}

                    {/* Action Hint */}
                    {isPickedByMyTeam ? (
                      <span className="text-[10px] text-emerald-700 font-bold inline-flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> تم الاختيار
                      </span>
                    ) : !isPickedByTeam1 && !isPickedByTeam2 ? (
                      <span
                        className={`text-[10px] font-bold ${
                          isMyTeamFull ? 'text-[#777B73]/50' : 'text-[#14543D]'
                        }`}
                      >
                        {isMyTeamFull ? 'اكتملت فئاتك' : '+ اختيار لفريقك'}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}

            {filteredComingSoonMainCards.map((mainCat) => (
              <button
                key={mainCat.id}
                type="button"
                aria-disabled="true"
                onClick={() => triggerComingSoonAlert()}
                className="p-3 rounded-2xl border-2 border-dashed border-[#D4D9CC] bg-[#F3F5E9]/85 text-right transition-all cursor-not-allowed relative flex flex-col justify-between min-h-[100px] select-none opacity-90 hover:border-[#F07842]/70 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {mainCat.imageUrl ? (
                      <img
                        src={mainCat.imageUrl}
                        alt={mainCat.name}
                        className="w-7 h-7 rounded-lg object-cover grayscale-[45%] brightness-75 border border-[#E5E8DD] shrink-0"
                      />
                    ) : null}
                    <span className="font-display text-xs font-bold text-[#252824] truncate">
                      {mainCat.name}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] font-bold inline-flex items-center gap-1 shrink-0 shadow-xs">
                    <Clock className="w-2.5 h-2.5" />
                    <span>قريباً</span>
                  </span>
                </div>

                {(mainCat.description || mainCat.tagline) && (
                  <p className="text-[10px] text-[#777B73] line-clamp-1 mb-1">
                    {mainCat.description || mainCat.tagline}
                  </p>
                )}

                <div className="pt-1 flex items-center justify-between text-[10px] font-bold text-[#D9602B]">
                  <span>غير متاحة حالياً</span>
                  <Lock className="w-3 h-3 text-[#777B73]" />
                </div>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* 5 CONDITIONS VALIDATION & START CHALLENGE BUTTON */}
        <div className="bg-[#FFFFFF] border-2 border-[#14543D]/30 rounded-3xl p-6 md:p-8 space-y-5 shadow-sm">
          {/* Checklist header */}
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold text-[#252824]">
              شروط بدء التحدي (5 شروط ملزمة):
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-bold pt-1">
              {/* 1. Host in */}
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>1. المضيف متصل</span>
              </div>

              {/* 2. Opponent in */}
              <div
                className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                  hasOpponent
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
                }`}
              >
                {hasOpponent ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                )}
                <span>2. المنافس متصل</span>
              </div>

              {/* 3. Team 1 Picks */}
              <div
                className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                  team1Picks.length === 3
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-[#F3F5E9] text-[#777B73] border-[#E5E8DD]'
                }`}
              >
                {team1Picks.length === 3 ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-[#777B73] shrink-0" />
                )}
                <span>3. فئات المضيف ({team1Picks.length}/3)</span>
              </div>

              {/* 4. Team 2 Picks */}
              <div
                className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                  team2Picks.length === 3
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-[#F3F5E9] text-[#777B73] border-[#E5E8DD]'
                }`}
              >
                {team2Picks.length === 3 ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-[#777B73] shrink-0" />
                )}
                <span>4. فئات المنافس ({team2Picks.length}/3)</span>
              </div>

              {/* 5. Realtime sync */}
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>5. التزامن متصل</span>
              </div>
            </div>
          </div>

          {/* Action button row */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#E5E8DD]">
            <div className="text-xs text-[#777B73] text-center sm:text-right">
              {!hasOpponent
                ? 'بانتظار انضمام المنافس لتفعيل إمكانية بدء التحدي.'
                : !isCategoriesComplete
                ? `اختار ${team1.name} (${team1Picks.length}/3) واختار ${team2.name} (${team2Picks.length}/3).`
                : 'تم استيفاء جميع الشروط! الغرفة جاهزة لانطلاق المباراة الآن.'}
            </div>

            {isHost ? (
              <button
                type="button"
                disabled={!isRoomReadyToStart || loading}
                onClick={handleHostStartGameClick}
                className={`px-8 py-4 text-base font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shrink-0 ${
                  isRoomReadyToStart && !loading
                    ? 'bg-[#14543D] text-[#FFFFFF] hover:bg-[#0E3D2C] cursor-pointer shadow-lg active:scale-95 animate-pulse'
                    : 'bg-zinc-200 text-zinc-500 border border-zinc-300 cursor-not-allowed opacity-75'
                }`}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جاري إطلاق المباراة...</span>
                  </div>
                ) : !hasOpponent ? (
                  <>
                    <Clock className="w-5 h-5 text-zinc-400" />
                    <span>بانتظار دخول المنافس...</span>
                  </>
                ) : team1Picks.length < 3 ? (
                  <>
                    <Layers className="w-5 h-5 text-zinc-400" />
                    <span>اخترت {team1Picks.length} من 3 فئات لفريقك</span>
                  </>
                ) : team2Picks.length < 3 ? (
                  <>
                    <Clock className="w-5 h-5 text-zinc-400" />
                    <span>بانتظار إكمال فئات المنافس ({team2Picks.length}/3)</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-5 h-5 text-[#F07842]" />
                    <span>بدء التحدي الآن 🔥</span>
                  </>
                )}
              </button>
            ) : isSpectator ? (
              <div className="flex items-center gap-2 text-xs font-bold text-[#14543D] bg-[#EAF2EE] px-5 py-3 rounded-xl border border-[#14543D]/20">
                <Eye className="w-4 h-4 text-[#F07842]" />
                <span>
                  {isRoomReadyToStart
                    ? 'الغرفة جاهزة! بانتظار بدء المباراة من المضيف للمشاهدة المباشرة'
                    : 'تتابع الآن تجهيز الفريقين واختيار الفئات بوضع المشاهدة...'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-bold text-[#14543D] bg-[#EAF2EE] px-5 py-3 rounded-xl border border-[#14543D]/20">
                <span className="w-2.5 h-2.5 rounded-full bg-[#14543D] animate-ping" />
                <span>
                  {isRoomReadyToStart
                    ? 'الغرفة جاهزة! بانتظار إشارة بدء التحدي من المضيف 🚀'
                    : 'بانتظار استيفاء الشروط واكتمال الفئات من الفريقين...'}
                </span>
              </div>
            )}
          </div>
        </div>

        <InviteFriendsModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          user={user}
          roomCode={currentRoom.code}
          canInviteToPlay={!hasOpponent || playersList.length < (currentRoom.maxPlayers || 16)}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: 3. IN-GAME BOARD (المباراة المباشرة المتزامنة)
  // -------------------------------------------------------------
  if (currentRoom.status === 'in_game' || (currentRoom.status as string) === 'playing') {
    return (
      <div className="max-w-[1320px] mx-auto px-4 py-6 space-y-6">
        {/* Toast Alert */}
        {toastNotification && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#14543D] text-[#FFFFFF] px-5 py-2.5 rounded-2xl shadow-lg border border-[#FFFFFF]/20 text-xs font-bold flex items-center gap-2 animate-bounce">
            <BellRing className="w-4 h-4 text-[#F07842]" />
            <span>{toastNotification}</span>
          </div>
        )}

        {/* TOP STATUS BAR: Teams Scores & Turn Indicator */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 md:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-[#E5E8DD] pb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F07842]" />
              <span className="text-xs font-bold text-[#14543D]">
                غرفة: <span className="font-mono">{currentRoom.code}</span>
              </span>
              <span className="text-xs text-[#777B73]">•</span>
              <span className="text-xs text-[#777B73]">
                {isHost
                  ? 'أنت المضيف 👑'
                  : isSpectator
                  ? 'وضع المشاهدة (للعرض فقط)'
                  : `أنت متصل كـ ${playerProfile.name}`}
              </span>
              {spectatorsList.length > 0 && (
                <>
                  <span className="text-xs text-[#777B73]">•</span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#14543D] tabular-nums">
                    <Eye className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>{spectatorsList.length} مشاهد</span>
                  </span>
                </>
              )}
            </div>

            {/* Turn badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#777B73]">الدور الآن:</span>
              {activeTurnTeam && (
                <div
                  className="px-3 py-1 rounded-full text-xs font-bold text-[#FFFFFF] flex items-center gap-1.5 shadow-sm"
                  style={{ backgroundColor: activeTurnTeam.color }}
                >
                  <span>{activeTurnTeam.name}</span>
                </div>
              )}
            </div>

            {/* Sound, Invite & Host Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {!isSpectator && (
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#14543D] text-white hover:bg-[#0E3D2C] cursor-pointer flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-[#F07842]" />
                  <span>دعوة للمشاهدة</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => soundFX.toggle()}
                title={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5 border transition-colors ${
                  soundEnabled
                    ? 'bg-[#EAF2EE] border-[#14543D]/20 text-[#14543D] hover:bg-[#DDECE4]'
                    : 'bg-[#F3F5E9] border-[#E5E8DD] text-[#777B73]'
                }`}
              >
                {soundEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>الأصوات</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>مكتوم</span>
                  </>
                )}
              </button>

              {isHost && (
                <button
                  type="button"
                  onClick={() => hostFinishGame(currentRoom.code, currentRoom.hostId)}
                  className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
                >
                  إنهاء المباراة
                </button>
              )}

              {isSpectator && (
                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>مغادرة المشاهدة</span>
                </button>
              )}
            </div>
          </div>

          {/* Teams Scores Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {currentRoom.teams.map((team, idx) => {
              const isTurn = idx === currentRoom.activeTeamIndex % currentRoom.teams.length;
              return (
                <div
                  key={team.id}
                  className={`p-3.5 rounded-xl border-2 transition-all flex items-center justify-between ${
                    isTurn
                      ? 'bg-[#F3F5E9] shadow-sm'
                      : 'bg-[#FFFFFF] border-[#E5E8DD]'
                  }`}
                  style={{ borderColor: isTurn ? team.color : '#E5E8DD' }}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="text-xs font-bold text-[#252824] truncate max-w-[100px]">
                        {team.name}
                      </span>
                    </div>
                    {isTurn && (
                      <span className="text-[10px] font-bold text-[#14543D]">
                        الدور الحالي
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#14543D]">
                    {team.score}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GAME BOARD: Subcategory Columns × 5 Point Rows */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 md:p-6 shadow-sm overflow-x-auto">
          <div
            className="grid gap-3 min-w-[700px]"
            style={{
              gridTemplateColumns: `repeat(${onlineBoardColumns.length}, minmax(130px, 1fr))`,
            }}
          >
            {/* Column Headers (Subcategories) */}
            {onlineBoardColumns.map((col, idx) => (
              <div
                key={idx}
                className="rounded-2xl p-3 border text-center space-y-1.5 shadow-xs"
                style={{
                  backgroundColor: col.bgTint,
                  borderColor: `${col.borderTint}40`,
                }}
              >
                <div
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block text-white"
                  style={{ backgroundColor: col.teamColor }}
                >
                  {col.teamName}
                </div>
                <div className="font-display font-bold text-xs text-[#252824] line-clamp-2 min-h-[32px] flex items-center justify-center">
                  {col.subName}
                </div>
              </div>
            ))}

            {/* 5 Point Rows (100, 200, 300, 400, 500) */}
            {POINT_TIERS.map((points) => (
              <React.Fragment key={points}>
                {onlineBoardColumns.map((col, cIdx) => {
                  const tileKey = `${col.subId}__${points}`;
                  const isUsed = currentRoom.usedTileKeys.includes(tileKey);

                  return (
                    <button
                      key={`${col.subId}_${points}`}
                      type="button"
                      disabled={isUsed || (!isHost && !isUsed)}
                      onClick={() =>
                        handleHostTileClick(col.subId, col.subName, points, tileKey)
                      }
                      className={`h-20 md:h-24 rounded-2xl border-2 font-display text-2xl md:text-3xl font-bold transition-all flex flex-col items-center justify-center cursor-pointer select-none ${
                        isUsed
                          ? 'bg-[#E5E8DD]/40 border-transparent text-[#777B73]/40 cursor-not-allowed'
                          : isHost
                          ? 'bg-[#FFFFFF] hover:bg-[#EAF2EE] border-[#14543D]/30 text-[#14543D] hover:scale-[1.02] shadow-sm active:scale-95'
                          : 'bg-[#FFFFFF] border-[#14543D]/20 text-[#14543D]/80 cursor-default'
                      }`}
                    >
                      {isUsed ? (
                        <Check className="w-6 h-6 text-[#777B73]/40" />
                      ) : (
                        <span>{points}</span>
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Bottom notice for non-hosts */}
          {!isHost && (
            <div className="pt-4 text-center text-xs font-bold text-[#777B73]">
              المضيف ({currentRoom.hostName}) هو من يملك صلاحية فتح الأسئلة وتسجيل النقاط.
            </div>
          )}
        </div>

        {/* SYNCHRONIZED QUESTION MODAL (POPS UP FOR ALL PLAYERS IN REAL TIME) */}
        {currentRoom.activeQuestion && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-3xl p-6 md:p-8 max-w-2xl w-full space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/20">
                    {currentRoom.activeQuestion.subcategoryName}
                  </span>
                  <span className="font-mono text-sm font-bold text-[#F07842]">
                    {currentRoom.activeQuestion.points} نقطة
                  </span>
                </div>

                {/* Countdown Timer */}
                <div
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-mono text-base font-bold ${
                    modalTimeLeft <= 10
                      ? 'bg-rose-100 text-rose-700 animate-pulse'
                      : 'bg-[#F3F5E9] text-[#252824]'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{modalTimeLeft}s</span>
                </div>
              </div>

              {/* Question Body */}
              <div className="space-y-4 text-center py-2">
                <h3 className="font-display text-xl md:text-2xl font-bold text-[#252824] leading-relaxed">
                  {currentRoom.activeQuestion.questionText}
                </h3>

                {/* Optional Question Image */}
                {currentRoom.activeQuestion.imageUrl && (
                  <div className="max-w-md mx-auto rounded-2xl overflow-hidden border border-[#E5E8DD]">
                    <img
                      src={currentRoom.activeQuestion.imageUrl}
                      alt={
                        currentRoom.activeQuestion.imageDescription ||
                        'صورة السؤال'
                      }
                      className="w-full max-h-64 object-contain bg-[#F3F5E9]"
                    />
                  </div>
                )}
              </div>

              {/* Answer Area (Revealed or Masked) */}
              {currentRoom.activeQuestion.isAnswerRevealed ? (
                <div className="p-4 rounded-2xl bg-[#EAF2EE] border-2 border-[#14543D] text-center space-y-1 animate-in fade-in">
                  <div className="text-xs font-bold text-[#14543D]">
                    الإجابة الصحيحة:
                  </div>
                  <div className="font-display text-xl font-bold text-[#14543D]">
                    {currentRoom.activeQuestion.correctAnswer}
                  </div>
                  {currentRoom.activeQuestion.explanation && (
                    <p className="text-xs text-[#777B73] pt-1">
                      {currentRoom.activeQuestion.explanation}
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] text-center space-y-1">
                  <div className="text-xs font-bold text-[#777B73]">
                    الإجابة مخفية حالياً
                  </div>
                  <div className="text-xs text-[#777B73]">
                    {isHost
                      ? 'اضغط على زر كشف الإجابة لعرضها للجميع'
                      : 'بانتظار المضيف لكشف الإجابة...'}
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              {isHost ? (
                <div className="space-y-3 pt-2">
                  {!currentRoom.activeQuestion.isAnswerRevealed ? (
                    <button
                      type="button"
                      onClick={handleHostReveal}
                      className="w-full py-3.5 text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Eye className="w-5 h-5" />
                      <span>إظهار الإجابة للجميع</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-center text-[#252824]">
                        اختر الفريق الذي أجاب إجابة صحيحة لمنحه النقاط:
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {currentRoom.teams.map((t, tIdx) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleHostAward(tIdx)}
                            className="py-3 px-3 rounded-xl text-xs font-bold text-[#FFFFFF] hover:opacity-95 cursor-pointer shadow-xs transition-transform active:scale-95"
                            style={{ backgroundColor: t.color }}
                          >
                            + {currentRoom.activeQuestion?.points} لـ {t.name}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleHostSkip}
                          className="flex-1 py-2.5 rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] text-xs font-bold text-[#777B73] cursor-pointer"
                        >
                          تخطي بدون نقاط
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            hostCloseActiveQuestion(
                              currentRoom.code,
                              currentRoom.hostId
                            )
                          }
                          className="py-2.5 px-4 rounded-xl border border-[#E5E8DD] text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          إغلاق
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : isSpectator ? (
                <div className="pt-2 text-center text-xs font-bold text-[#14543D] bg-[#EAF2EE] py-3 px-4 rounded-xl border border-[#14543D]/15">
                  تتابع السؤال الآن بوضع المشاهد (للعرض فقط — يتم تحديث الإجابة والنقاط مباشرة).
                </div>
              ) : (
                /* Non-Host Player Interactive Buttons */
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handlePlayerBuzz('buzz_in')}
                    className="flex-1 w-full py-3 text-xs font-bold rounded-xl bg-[#14543D] text-[#FFFFFF] hover:bg-[#0E3D2C] cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Hand className="w-4 h-4 text-[#F07842]" />
                    <span>أنا جاهز للإجابة! (رفع اليد)</span>
                  </button>

                  {!currentRoom.activeQuestion.isAnswerRevealed && (
                    <button
                      type="button"
                      onClick={() => handlePlayerBuzz('reveal_answer')}
                      className="py-3 px-4 rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] text-xs font-bold text-[#252824] cursor-pointer"
                    >
                      طلب كشف الإجابة 📢
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <InviteFriendsModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          user={user}
          roomCode={currentRoom.code}
          canInviteToPlay={false}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: 4. RESULTS SCREEN (نهاية المباراة)
  // -------------------------------------------------------------
  const sortedTeams = [...currentRoom.teams].sort((a, b) => b.score - a.score);
  const winningTeam = sortedTeams[0];

  return (
    <div className="max-w-[800px] mx-auto px-4 py-12 text-center space-y-8 animate-in fade-in">
      <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-3xl p-8 md:p-12 space-y-6 shadow-xl">
        <div className="w-20 h-20 rounded-3xl bg-[#FEF2EC] border border-[#F07842]/20 text-[#F07842] flex items-center justify-center mx-auto">
          <Trophy className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <div className="inline-block px-4 py-1 rounded-full bg-[#EAF2EE] text-xs font-bold text-[#14543D]">
            انتهت المباراة أونلاين 🏁
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-[#252824]">
            مبروك الفوز لـ {winningTeam?.name}! 🏆
          </h1>
          <p className="text-sm text-[#777B73]">
            برصيد{' '}
            <span className="font-bold text-[#14543D]">
              {winningTeam?.score} نقطة
            </span>
          </p>
        </div>

        {/* Final Scoreboard */}
        <div className="space-y-3 pt-4 max-w-md mx-auto">
          {sortedTeams.map((team, idx) => (
            <div
              key={team.id}
              className={`p-4 rounded-2xl border-2 flex items-center justify-between ${
                idx === 0
                  ? 'bg-[#EAF2EE] border-[#14543D]'
                  : 'bg-[#F3F5E9] border-[#E5E8DD]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-[#777B73]">
                  #{idx + 1}
                </span>
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                <span className="font-display font-bold text-sm text-[#252824]">
                  {team.name}
                </span>
              </div>
              <div className="font-mono text-xl font-bold text-[#14543D]">
                {team.score} نقطة
              </div>
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="pt-6 flex flex-wrap items-center justify-center gap-4">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={() => hostRestartGame(currentRoom.code, currentRoom.hostId, false)}
                className="px-6 py-3.5 rounded-xl bg-[#14543D] text-[#FFFFFF] text-sm font-bold hover:bg-[#0E3D2C] cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>جولة جديدة بنفس الغرفة</span>
              </button>

              <button
                type="button"
                onClick={() => hostRestartGame(currentRoom.code, currentRoom.hostId, true)}
                className="px-6 py-3.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-sm font-bold text-[#252824] hover:bg-[#F3F5E9] cursor-pointer"
              >
                العودة لصالة الانتظار
              </button>
            </>
          ) : isSpectator ? (
            <div className="text-xs font-bold text-[#777B73]">
              انتهت المباراة — كنت تشاهد هذه المواجهة كمشاهد.
            </div>
          ) : (
            <div className="text-xs font-bold text-[#777B73]">
              بانتظار المضيف لإعادة بدء جولة جديدة أو العودة للانتظار.
            </div>
          )}

          <button
            type="button"
            onClick={handleLeaveRoom}
            className="px-6 py-3.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm font-bold cursor-pointer flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>{isSpectator ? 'مغادرة المشاهدة' : 'مغادرة الغرفة'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
