import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
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
  ShieldAlert,
  EyeOff,
  Image as ImageIcon,
  ZoomIn,
  RefreshCw,
  WifiOff,
  Trophy,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
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
  QuestionDedupSettings,
  SubcategoryItem,
  TriviaQuestion,
  VisualEffectsSettings,
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
import { CategoryIcon } from '../components/CategoryIcon';
import { InviteFriendsModal } from '../components/InviteFriendsModal';
import { QuestionAudioPlayer } from '../components/QuestionAudioPlayer';
import { WhoAnsweredCorrectlyPanel } from '../components/WhoAnsweredCorrectlyPanel';
import { inferQuestionMediaType } from '../services/questionService';
import { saveMatchProgressToFirestore } from '../services/matchService';
import { soundFX } from '../services/soundEffects';
import {
  DEFAULT_QUESTION_DEDUP_SETTINGS,
  selectNextQuestionForSlot,
  shouldRecordQuestionSeenForParticipant,
  SlotSelectionResult,
} from '../utils/questionDedupLogic';
import { evaluateMatchOutcome } from '../utils/matchOutcome';
import {
  AnimatedScoreCounter,
  AnswerFeedbackBanner,
  MatchCelebrationHeader,
  useEffectiveVisualEffects,
} from '../components/GameVisualEffects';
import {
  DEFAULT_WALA_KALIMA_SETTINGS,
  isWalaKalimaCategory,
  WalaKalimaSettings,
} from '../types/walaKalima';
import { WalaKalimaBoardModal } from '../components/WalaKalimaBoardModal';
import { POINT_TO_DIFFICULTY } from '../types/game';
import { hostCloseActiveQuestion as closeOnlineActiveQuestion } from '../services/multiplayerService';
import { AlertBanner, StatusBadge } from '../components/ui';

interface OnlineMultiplayerPageProps {
  user: User | null;
  mainCategories: MainCategoryMeta[];
  subcategories: SubcategoryItem[];
  approvedQuestions: TriviaQuestion[];
  seenQuestionIds?: Set<string>;
  questionDedupSettings?: QuestionDedupSettings;
  onRecordQuestionSeen?: (params: {
    questionId: string;
    category: string;
    subcategoryId?: string;
    mode: 'local' | 'online';
    displayKey?: string;
  }) => Promise<void> | void;
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
  visualEffectsSettings?: VisualEffectsSettings;
  walaKalimaSettings?: WalaKalimaSettings;
}

const POINT_TIERS: PointValue[] = [100, 200, 300, 400, 500];

export const OnlineMultiplayerPage: React.FC<OnlineMultiplayerPageProps> = ({
  user,
  mainCategories,
  subcategories,
  approvedQuestions,
  seenQuestionIds,
  questionDedupSettings = DEFAULT_QUESTION_DEDUP_SETTINGS,
  onRecordQuestionSeen,
  onNavigateHome,
  onNavigate,
  onOpenAuthModal,
  initialRoomCode,
  initialJoinRole = 'player',
  autoJoinNonce = 0,
  onPresenceActivityChange,
  visualEffectsSettings,
  walaKalimaSettings = DEFAULT_WALA_KALIMA_SETTINGS,
}) => {
  const { isOnline } = useOnlineStatus();
  const effects = useEffectiveVisualEffects(visualEffectsSettings);
  const [activeOnlineWkTile, setActiveOnlineWkTile] = useState<{
    subId: string;
    subName: string;
    points: PointValue;
    tileKey: string;
  } | null>(null);
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
  const [hostAnswerPeek, setHostAnswerPeek] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [onlineImageLoadFailed, setOnlineImageLoadFailed] =
    useState<boolean>(false);
  const [onlineImageRetryNonce, setOnlineImageRetryNonce] = useState<number>(0);
  const [onlineZoomedImageUrl, setOnlineZoomedImageUrl] = useState<
    string | null
  >(null);
  const [onlineAudioReady, setOnlineAudioReady] = useState<boolean>(true);
  const [onlineAudioLoadWaitMs, setOnlineAudioLoadWaitMs] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    soundFX.isEnabled()
  );
  const [onlineAnswerFeedback, setOnlineAnswerFeedback] = useState<{
    type: 'correct' | 'wrong';
    headline: string;
    detail: string;
    eventKey: string;
  } | null>(null);

  // Ref to active subscription & previous room state for live SFX & VFX triggers
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const audioLoadingStartedAtRef = useRef<number | null>(null);
  const onlineFeedbackTimerRef = useRef<number | null>(null);
  const inFlightAwardTileRef = useRef<string | null>(null);
  const prevModalTimeLeftRef = useRef<number>(60);
  const [pendingHostChoice, setPendingHostChoice] = useState<number | 'none' | null>(null);
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

  useEffect(() => {
    if (!onlineZoomedImageUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOnlineZoomedImageUrl(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onlineZoomedImageUrl]);

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

  // Clear answer feedback timer on unmount
  useEffect(() => {
    return () => {
      if (onlineFeedbackTimerRef.current !== null) {
        window.clearTimeout(onlineFeedbackTimerRef.current);
      }
    };
  }, []);

  // Active question countdown timer (anchored to openedAt + fair audio load delay so buffering never penalizes teams)
  useEffect(() => {
    const aq = currentRoom?.activeQuestion;
    if (!aq) {
      prevModalTimeLeftRef.current = currentRoom?.timerDuration || 60;
      return;
    }
    const qDuration = currentRoom.timerDuration || 60;
    const isAudioQ = inferQuestionMediaType(aq) === 'audio';

    if (isAudioQ && !onlineAudioReady) {
      setModalTimeLeft(qDuration);
      return;
    }

    const openedAt = (aq.openedAt || Date.now()) + (isAudioQ ? onlineAudioLoadWaitMs : 0);

    const updateTimer = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - openedAt) / 1000));
      const remaining = Math.max(0, qDuration - elapsedSeconds);
      setModalTimeLeft(remaining);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 500);
    return () => window.clearInterval(interval);
  }, [
    currentRoom?.activeQuestion,
    currentRoom?.timerDuration,
    onlineAudioReady,
    onlineAudioLoadWaitMs,
  ]);

  // Timer tick & time-up sound effects for Online Multiplayer (primary question timer)
  useEffect(() => {
    const q = currentRoom?.activeQuestion;
    const isAudioWaiting =
      Boolean(q) && inferQuestionMediaType(q) === 'audio' && !onlineAudioReady;
    if (!q || q.isAnswerRevealed || isAudioWaiting) {
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
  }, [modalTimeLeft, currentRoom?.activeQuestion, onlineAudioReady]);

  // Reset host-only private answer peek & media readiness whenever active question changes
  useEffect(() => {
    setHostAnswerPeek(false);
    setActionBusy(false);
    setOnlineImageLoadFailed(false);
    setOnlineImageRetryNonce(0);
    setOnlineZoomedImageUrl(null);
    const aq = currentRoom?.activeQuestion;
    const isAudioQ = inferQuestionMediaType(aq) === 'audio';
    setOnlineAudioReady(!isAudioQ);
    setOnlineAudioLoadWaitMs(0);
    audioLoadingStartedAtRef.current = isAudioQ ? Date.now() : null;
  }, [currentRoom?.activeQuestion?.tileKey, currentRoom?.activeQuestion?.openedAt]);

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
    if (
      !prev.isAnswerRevealed &&
      currentSnapshot.isAnswerRevealed
    ) {
      soundFX.playAnswerReveal();
    }

    // 6. Scoring / Wrong / Buzz-in Feedback (SFX + real-time synced VFX)
    const scoringTeamIdx = teamScores.findIndex(
      (score, idx) => score > (prev.teamScores[idx] ?? 0)
    );
    const triggerSyncedFeedback = (
      type: 'correct' | 'wrong',
      headline: string,
      detail: string,
      durationMs: number
    ) => {
      if (onlineFeedbackTimerRef.current !== null) {
        window.clearTimeout(onlineFeedbackTimerRef.current);
      }
      setOnlineAnswerFeedback({
        type,
        headline,
        detail,
        eventKey: `${currentSnapshot.code}_${currentSnapshot.lastActionAt}_${type}`,
      });
      onlineFeedbackTimerRef.current = window.setTimeout(() => {
        setOnlineAnswerFeedback(null);
        onlineFeedbackTimerRef.current = null;
      }, durationMs);
    };

    if (scoringTeamIdx >= 0 && !(!wasFinished && isNowFinished)) {
      soundFX.playTeamScore(scoringTeamIdx);
      const scoredTeam = currentRoom.teams?.[scoringTeamIdx];
      const delta =
        (teamScores[scoringTeamIdx] ?? 0) - (prev.teamScores[scoringTeamIdx] ?? 0);
      triggerSyncedFeedback(
        'correct',
        'إجابة صحيحة!',
        `${scoredTeam?.name || 'الفريق'} +${delta} نقطة`,
        1750
      );
    } else if (currentSnapshot.lastActionAt !== prev.lastActionAt) {
      const msg = currentRoom.lastActionMessage || '';
      if (currentSnapshot.totalScore > prev.totalScore && !(!wasFinished && isNowFinished)) {
        soundFX.playCorrect();
        triggerSyncedFeedback('correct', 'إجابة صحيحة!', msg, 1750);
      } else if (
        msg.includes('تم تخطي السؤال') ||
        msg.includes('بدون نقاط') ||
        msg.includes('إجابة خاطئة')
      ) {
        soundFX.playWrong();
        if (!isNowFinished) {
          triggerSyncedFeedback('wrong', 'إجابة خاطئة', msg, 1500);
        }
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

  // Pre-index all approved questions by subcategory and points for fast slot lookups
  const questionsBySlotMap = useMemo(() => {
    const map = new Map<string, TriviaQuestion[]>();
    for (const q of approvedQuestions) {
      if (q.subcategoryId) {
        const idKey = `${q.subcategoryId}__${q.points}`;
        if (!map.has(idKey)) map.set(idKey, []);
        map.get(idKey)!.push(q);
      }
      const nameKey = `${q.category.trim()}__${q.points}`;
      if (!map.has(nameKey)) map.set(nameKey, []);
      map.get(nameKey)!.push(q);
    }
    return map;
  }, [approvedQuestions]);

  const findSlotForTile = useCallback(
    (
      subId: string,
      subName: string,
      points: PointValue,
      tileKey: string
    ): SlotSelectionResult => {
      const idKey = `${subId}__${points}`;
      const nameKey = `${subName.trim()}__${points}`;
      let candidates =
        questionsBySlotMap.get(idKey) || questionsBySlotMap.get(nameKey);

      if (!candidates || candidates.length === 0) {
        candidates = approvedQuestions.filter(
          (q) =>
            (q.subcategoryId === subId || q.category.trim() === subName.trim()) &&
            q.points === points
        );
      }

      return selectNextQuestionForSlot({
        candidates: candidates || [],
        tileKey,
        currentlyOpenTileKey: currentRoom?.activeQuestion?.tileKey || null,
        roundUsedQuestionIds: currentRoom?.roundUsedQuestionIds || [],
        userSeenQuestionIds: seenQuestionIds || new Set<string>(),
        allowRepeatAfterExhaustion: Boolean(
          questionDedupSettings?.allowRepeatAfterExhaustion
        ),
      });
    },
    [
      questionsBySlotMap,
      approvedQuestions,
      currentRoom?.roundUsedQuestionIds,
      currentRoom?.activeQuestion?.tileKey,
      seenQuestionIds,
      questionDedupSettings?.allowRepeatAfterExhaustion,
    ]
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
                  mediaType: inferQuestionMediaType(updatedRoom.activeQuestion),
                  imageUrl: updatedRoom.activeQuestion.imageUrl,
                  imageDescription: updatedRoom.activeQuestion.imageDescription,
                  audioUrl: updatedRoom.activeQuestion.audioUrl,
                  audioMaxPlays: updatedRoom.activeQuestion.audioMaxPlays ?? null,
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

    if (!isOnline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setErrorMsg('يتطلب اللعب عن بُعد اتصالاً نشطاً بالإنترنت لإنشاء غرفة.');
      return;
    }

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

    if (!isOnline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setErrorMsg('يتطلب اللعب عن بُعد اتصالاً نشطاً بالإنترنت للانضمام إلى غرفة.');
      return;
    }

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

    const hasComingSoonPick = [...t1Picks, ...t2Picks].some((pickId) => {
      const matchedSub = activeSubcategories.find((s) => s.id === pickId);
      const matchedMain = mainCategories.find(
        (m) => m.id === pickId || m.name === pickId
      );
      return Boolean((matchedSub && isSubComingSoon(matchedSub)) || matchedMain?.isComingSoon);
    });

    if (hasComingSoonPick) {
      setErrorMsg(
        'إحدى الفئات المختارة حالياً في وضع «قريباً» ولا يمكن بدء مباراة جديدة بها. يرجى استبدالها بفئة متاحة.'
      );
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

    if (isWalaKalimaCategory({ subcategoryId: subId, subcategoryName: subName })) {
      setErrorMsg(null);
      setActiveOnlineWkTile({ subId, subName, points, tileKey });
      return;
    }

    const slot = findSlotForTile(subId, subName, points, tileKey);
    const matchedQ = slot.question;
    if (!matchedQ) {
      const msg = slot.isExhausted
        ? `خلصت الأسئلة الجديدة في هذي الفئة (${subName} - ${points} نقطة).`
        : 'لا يتوفر سؤال مخصص لهذه الخانة حالياً.';
      setErrorMsg(msg);
      setToastNotification(msg);
      window.setTimeout(() => {
        setToastNotification((prev) => (prev === msg ? null : prev));
      }, 3600);
      return;
    }

    setErrorMsg(null);

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
      mediaType: inferQuestionMediaType(matchedQ),
      imageUrl: matchedQ.imageUrl || '',
      imageDescription: matchedQ.imageDescription || '',
      audioUrl: matchedQ.audioUrl || '',
      audioMaxPlays: matchedQ.audioMaxPlays ?? null,
      explanation: matchedQ.explanation || '',
      isAnswerRevealed: false,
      openedAt: Date.now(),
      openedByHostId: currentRoom.hostId,
    };

    try {
      setHostAnswerPeek(false);
      await hostSelectQuestion(currentRoom.code, currentRoom.hostId, payload);
    } catch (err) {
      console.error('Failed to open question for all players:', err);
    }
  };

  // 7. Host Award Points
  const handleHostAward = async (awardedTeamIndex: number) => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion || actionBusy) {
      return;
    }
    const { tileKey, questionId, points, isAnswerRevealed } = currentRoom.activeQuestion;
    if (!isAnswerRevealed) return;
    if ((currentRoom.usedTileKeys || []).includes(tileKey)) return;
    if (inFlightAwardTileRef.current === tileKey) return;
    if (awardedTeamIndex < 0 || awardedTeamIndex >= currentRoom.teams.length) return;

    const totalTiles = currentRoom.selectedSubcategoryIds.length * 5;
    inFlightAwardTileRef.current = tileKey;
    setPendingHostChoice(awardedTeamIndex);
    setActionBusy(true);
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
    } finally {
      inFlightAwardTileRef.current = null;
      setPendingHostChoice(null);
      setActionBusy(false);
    }
  };

  // 8. Host Skip Question ("ولا فريق")
  const handleHostSkip = async () => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion || actionBusy) {
      return;
    }
    const { tileKey, questionId, isAnswerRevealed } = currentRoom.activeQuestion;
    if (!isAnswerRevealed) return;
    if ((currentRoom.usedTileKeys || []).includes(tileKey)) return;
    if (inFlightAwardTileRef.current === tileKey) return;

    const totalTiles = currentRoom.selectedSubcategoryIds.length * 5;
    inFlightAwardTileRef.current = tileKey;
    setPendingHostChoice('none');
    setActionBusy(true);
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
    } finally {
      inFlightAwardTileRef.current = null;
      setPendingHostChoice(null);
      setActionBusy(false);
    }
  };

  // 9. Host Reveal Answer
  const handleHostReveal = async () => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion || actionBusy) {
      return;
    }
    setActionBusy(true);
    try {
      await hostRevealAnswer(currentRoom.code, currentRoom.hostId);
    } catch (err) {
      console.error('Failed to reveal answer:', err);
    } finally {
      setActionBusy(false);
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

  // Independently record the active displayed question for every signed-in participant (excluding spectators by default)
  useEffect(() => {
    const aq = currentRoom?.activeQuestion;
    if (!aq?.questionId || !currentRoom?.code || !onRecordQuestionSeen) return;

    const canRecord = shouldRecordQuestionSeenForParticipant({
      userId: user?.uid || null,
      isSpectator,
      trackSpectators: Boolean(questionDedupSettings?.trackSpectators),
    });
    if (!canRecord) return;

    void onRecordQuestionSeen({
      questionId: aq.questionId,
      category: aq.subcategoryName || aq.category || 'عام',
      subcategoryId: aq.subcategoryId || '',
      mode: 'online',
      displayKey: `online_${currentRoom.code}_${aq.tileKey}_${aq.openedAt || aq.questionId}`,
    });
  }, [
    currentRoom?.code,
    currentRoom?.activeQuestion?.questionId,
    currentRoom?.activeQuestion?.tileKey,
    currentRoom?.activeQuestion?.openedAt,
    currentRoom?.activeQuestion?.subcategoryName,
    currentRoom?.activeQuestion?.subcategoryId,
    currentRoom?.activeQuestion?.category,
    user?.uid,
    isSpectator,
    questionDedupSettings?.trackSpectators,
    onRecordQuestionSeen,
  ]);
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
      <div className="max-w-[700px] mx-auto px-3 sm:px-4 py-10 md:py-16 text-center space-y-5 sm:space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#FEF2EC] border border-[#F07842]/25 text-[#F07842] flex items-center justify-center mx-auto shadow-2xs">
          <Radio className="w-8 h-8 text-[#F07842]" />
        </div>
        <div className="space-y-2.5">
          <StatusBadge tone="green">تسجيل الدخول إلزامي</StatusBadge>
          <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-[#1B1F1C]">
            اللعب عن بُعد يتطلب تسجيل الدخول واتصالاً بالإنترنت
          </h1>
          <p className="text-xs sm:text-sm text-[#52574E] max-w-md mx-auto leading-relaxed">
            لإنشاء غرفة أو الانضمام إلى مباراة أونلاين وحفظ تقدمك ونتائجك، يرجى تسجيل الدخول إلى حسابك عند توفر اتصال بالإنترنت.
          </p>
          {!isOnline && (
            <AlertBanner tone="warning" className="max-w-md mx-auto text-right">
              <span>أنت غير متصل بالإنترنت حالياً</span>
            </AlertBanner>
          )}
        </div>
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          {isOnline && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="min-h-[48px] px-8 py-3.5 rounded-xl bg-[#14543D] text-[#FFFFFF] text-sm font-bold hover:bg-[#0E3F2D] cursor-pointer shadow-sm transition-colors flex items-center justify-center"
            >
              تسجيل الدخول / إنشاء حساب
            </button>
          )}
          <button
            type="button"
            onClick={onNavigateHome}
            className="min-h-[48px] px-6 py-3.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C] text-sm font-bold hover:bg-[#F7F8F1] cursor-pointer transition-colors flex items-center justify-center"
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
      <div className="max-w-[1000px] mx-auto px-3 sm:px-4 py-5 md:py-12 space-y-6 md:space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4 sm:pb-5">
          <div className="space-y-1.5">
            <StatusBadge tone="green">
              <Radio className="w-3.5 h-3.5 text-[#F07842]" />
              <span>اللعب عن بُعد • Online Multiplayer</span>
            </StatusBadge>
            <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-[#1B1F1C]">
              تحدّوا بعض أونلاين من أجهزتكم المختلفة!
            </h1>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="self-start sm:self-auto min-h-[44px] px-4 py-2 text-xs font-bold text-[#52574E] hover:text-[#1B1F1C] bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl hover:bg-[#F7F8F1] transition-colors cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>

        {/* Offline Connection Guard Banner */}
        {!isOnline && (
          <AlertBanner tone="warning">
            <div>
              <p className="font-bold">يتطلب اللعب عن بُعد اتصالاً بالإنترنت</p>
              <p className="text-xs text-[#52574E] mt-0.5 font-normal">
                أنت غير متصل حالياً. يمكنك العودة للرئيسية للعب في وضع «اللعب المحلي دون إنترنت» أو إعادة المحاولة فور توفر الإنترنت.
              </p>
            </div>
          </AlertBanner>
        )}

        {/* Error notification */}
        {errorMsg && (
          <AlertBanner tone="error" onDismiss={() => setErrorMsg(null)}>
            {errorMsg}
          </AlertBanner>
        )}

        {/* Tab Selection: Create vs Join */}
        <div className="grid grid-cols-2 gap-2.5 max-w-md mx-auto p-1.5 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl shadow-2xs">
          <button
            type="button"
            onClick={() => {
              setEntryMode('create');
              setErrorMsg(null);
            }}
            className={`min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
              entryMode === 'create'
                ? 'bg-[#14543D] text-[#FFFFFF] shadow-xs'
                : 'text-[#52574E] hover:text-[#1B1F1C] hover:bg-[#F7F8F1]'
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
            className={`min-h-[44px] py-2.5 px-4 rounded-xl text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
              entryMode === 'join'
                ? 'bg-[#14543D] text-[#FFFFFF] shadow-xs'
                : 'text-[#52574E] hover:text-[#1B1F1C] hover:bg-[#F7F8F1]'
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
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-6 md:p-10 max-w-xl mx-auto space-y-5 sm:space-y-6 shadow-xs"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/20 text-[#14543D] flex items-center justify-center mx-auto">
                <Crown className="w-7 h-7" />
              </div>
              <h2 className="font-display text-xl font-bold text-[#1B1F1C]">
                إنشاء غرفة تحدي أونلاين
              </h2>
              <p className="text-xs text-[#52574E]">
                ستحصل على رمز فريد مكون من 6 خانات لمشاركته مع أصدقائك.
              </p>
            </div>

            {/* Host Player Name */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                اسمك (المضيف):
              </label>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="مثال: سعود، نورة، أبو فهد..."
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 outline-none text-sm font-bold text-[#1B1F1C] placeholder:text-[#666B62] transition-colors"
                required
              />
            </div>

            {/* Teams Count (2 to 4) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                عدد الفرق المتنافسة:
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setTeamCount(count)}
                    className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      teamCount === count
                        ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                        : 'border-[#E5E8DD] bg-[#FFFFFF] text-[#52574E] hover:bg-[#F7F8F1]'
                    }`}
                  >
                    {count} فرق
                  </button>
                ))}
              </div>
            </div>

            {/* Teams Customization */}
            <div className="space-y-3 pt-1">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                تسمية الفرق:
              </label>
              <div className="space-y-2.5">
                {customTeams.map((team, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] focus-within:border-[#F07842] focus-within:bg-[#FFFFFF] transition-colors"
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
                      className="flex-1 min-h-[28px] bg-transparent border-none text-xs font-bold text-[#1B1F1C] placeholder:text-[#666B62] outline-none"
                      placeholder={`فريق ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Question Timer Duration */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                وقت الإجابة على السؤال:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[30, 45, 60, 90].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTimerDuration(sec)}
                    className={`min-h-[44px] py-2 rounded-xl text-xs font-bold font-mono tabular-nums border transition-colors cursor-pointer ${
                      timerDuration === sec
                        ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                        : 'border-[#E5E8DD] bg-[#FFFFFF] text-[#52574E] hover:bg-[#F7F8F1]'
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
              className="w-full min-h-[50px] py-3.5 text-base font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] active:scale-[0.99] rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
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
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-6 md:p-10 max-w-xl mx-auto space-y-5 sm:space-y-6 shadow-xs"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[#FEF2EC] border border-[#F07842]/20 text-[#F07842] flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <h2 className="font-display text-xl font-bold text-[#1B1F1C]">
                الانضمام إلى غرفة موجودة
              </h2>
              <p className="text-xs text-[#52574E]">
                أدخل رمز الغرفة المكون من 6 خانات الذي أرسله لك المضيف.
              </p>
            </div>

            {/* Room Code */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1B1F1C]">
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
                dir="ltr"
                className="w-full px-4 py-3.5 rounded-xl bg-[#F7F8F1] border-2 border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 outline-none text-center font-mono text-2xl font-bold tracking-widest text-[#14543D] uppercase placeholder:text-[#666B62] transition-colors"
                required
              />
            </div>

            {/* Player Name */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                اسمك المعروض:
              </label>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="اكتب اسمك للمباراة..."
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 outline-none text-sm font-bold text-[#1B1F1C] placeholder:text-[#666B62] transition-colors"
                required
              />
            </div>

            {/* Join Role: Player vs Spectator */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                طريقة الدخول للغرفة:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setJoinRole('player')}
                  className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    joinRole === 'player'
                      ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                      : 'border-[#E5E8DD] bg-[#FFFFFF] text-[#52574E] hover:bg-[#F7F8F1]'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>دخول كلاعب</span>
                </button>
                <button
                  type="button"
                  onClick={() => setJoinRole('spectator')}
                  className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    joinRole === 'spectator'
                      ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                      : 'border-[#E5E8DD] bg-[#FFFFFF] text-[#52574E] hover:bg-[#F7F8F1]'
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
              className="w-full min-h-[50px] py-3.5 text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
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
      <div className="max-w-[1150px] mx-auto px-3 sm:px-4 py-5 md:py-8 space-y-5 sm:space-y-8">
        {/* Offline Connection Warning Banner */}
        {!isOnline && (
          <AlertBanner tone="warning">
            انقطع الاتصال بالإنترنت — يتطلب اللعب عن بُعد اتصالاً بالإنترنت، وستعود المزامنة تلقائياً فور عودة الاتصال.
          </AlertBanner>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <AlertBanner tone="error" onDismiss={() => setErrorMsg(null)}>
            {errorMsg}
          </AlertBanner>
        )}

        {/* Toast Alert */}
        {toastNotification && (
          <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md bg-[#14543D] text-[#FFFFFF] px-4 py-2.5 rounded-2xl shadow-lg border border-[#FFFFFF]/20 text-xs font-bold flex items-center justify-center gap-2 text-center">
            <BellRing className="w-4 h-4 text-[#F07842] shrink-0" />
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
              className="min-h-[40px] px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 cursor-pointer transition-colors"
            >
              استلام دور المضيف 👑
            </button>
          </div>
        )}

        {/* Room Header & Invite Card */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-[#E5E8DD] pb-4 sm:pb-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#52574E] flex-wrap">
                <Radio className="w-3.5 h-3.5 text-[#14543D]" />
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
              <h1 className="font-display text-xl sm:text-2xl font-bold text-[#1B1F1C] mt-1">
                صالة التحدي واختيار الفئات
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {!isSpectator && (
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(true)}
                  className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4 text-[#F07842]" />
                  <span>دعوة أصدقاء</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>{isSpectator ? 'مغادرة المشاهدة' : 'مغادرة الغرفة'}</span>
              </button>
            </div>
          </div>

          {/* Big Room Code Box */}
          <div className="bg-[#F7F8F1] border border-[#14543D]/20 rounded-2xl p-4 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 text-center md:text-right">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#52574E]">
                رمز الغرفة (شاركه مع منافسك للانضمام):
              </div>
              <div className="font-mono text-3xl sm:text-4xl md:text-5xl font-bold tracking-widest text-[#14543D]">
                {currentRoom.code}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2.5 sm:gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={handleCopyCode}
                className="min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl bg-[#FFFFFF] hover:bg-[#EAF2EE] border border-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
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
                className="min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-xs font-bold text-[#FFFFFF] flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
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
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-sm">بانتظار دخول المنافس...</span>
                <span>لا يمكن بدء التحدي قبل انضمام المنافس إلى الغرفة باستخدام رمز الغرفة أعلاه.</span>
              </div>
            </div>
          ) : isCategoriesComplete ? (
            <div className="p-4 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/25 text-[#14543D] flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#14543D] shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-sm text-[#14543D]">الغرفة جاهزة الآن لبدء التحدي! 🚀</span>
                <span className="text-[#1B1F1C]">اكتمل اختيار 3 فئات لكل فريق (6 فئات إجمالاً). يمكن للمضيف إطلاق التحدي الآن.</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[#F7F8F1] border border-[#E5E8DD] text-[#1B1F1C] flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#F07842] shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-sm text-[#14543D]">المنافس متصل! مرحلة اختيار الفئات 🎯</span>
                <span className="text-[#52574E]">
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
              <h2 className="font-display text-lg font-bold text-[#1B1F1C]">
                فئات الفرق (3 فئات لكل فريق • 6 إجمالاً)
              </h2>
            </div>
            <div className="text-xs text-[#52574E]">
              تحديث مباشر متزامن فورياً على الشاشتين
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* TEAM 1 (Host Team) */}
            <div
              className={`bg-[#FFFFFF] border-2 rounded-2xl p-4 sm:p-5 space-y-4 transition-all shadow-2xs ${
                myTeamId === team1.id ? 'ring-2 ring-[#14543D]/20' : ''
              }`}
              style={{ borderColor: `${team1.color}60` }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-[#E5E8DD] pb-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: team1.color }}
                  />
                  <span className="font-display font-bold text-base text-[#1B1F1C] truncate">
                    {team1.name}
                  </span>
                  <StatusBadge tone="green">فريق المضيف 👑</StatusBadge>
                </div>
                <span className="text-xs font-bold font-mono tabular-nums px-2.5 py-1 rounded-lg bg-[#F7F8F1] border border-[#E5E8DD] text-[#14543D]">
                  {team1Picks.length} / 3 فئات
                </span>
              </div>

              {/* Team 1 Players */}
              <div className="text-xs text-[#52574E] flex items-center gap-2 flex-wrap">
                <span className="font-bold">اللاعبون:</span>
                {playersList
                  .filter((p) => p.teamId === team1.id)
                  .map((p) => (
                    <span
                      key={p.id}
                      className="px-2 py-0.5 rounded-md bg-[#F7F8F1] border border-[#E5E8DD] text-[#1B1F1C] font-bold text-[11px]"
                    >
                      {p.name} {p.id === playerProfile.id ? '(أنت)' : ''}
                    </span>
                  ))}
              </div>

              {/* 3 Category Slots for Team 1 */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-bold text-[#52574E]">
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
                          className="p-2.5 sm:p-3 rounded-xl border border-[#14543D]/30 bg-[#EAF2EE] flex flex-col justify-between min-h-[84px] relative group"
                        >
                          <div className="text-[11px] font-bold text-[#14543D]/80 line-clamp-1 pl-8">
                            {subObj.mainCategory || 'فئة'}
                          </div>
                          <div className="font-display text-xs sm:text-sm font-bold text-[#14543D] leading-snug line-clamp-2 text-center my-auto py-0.5">
                            {subObj.name}
                          </div>
                          {isMyTeamChoice && (
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryPick(subId)}
                              title="إلغاء اختيار هذه الفئة"
                              aria-label={`إلغاء اختيار ${subObj.name}`}
                              className="absolute top-1 left-1 min-w-[28px] min-h-[28px] rounded-lg bg-[#FFFFFF]/90 hover:bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={slotIdx}
                        className="p-2.5 rounded-xl border border-dashed border-[#E5E8DD] bg-[#F7F8F1] flex flex-col items-center justify-center text-center min-h-[84px] text-[#666B62]"
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
              className={`bg-[#FFFFFF] border-2 rounded-2xl p-4 sm:p-5 space-y-4 transition-all shadow-2xs ${
                myTeamId === team2.id ? 'ring-2 ring-[#F07842]/20' : ''
              }`}
              style={{ borderColor: `${team2.color}60` }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-[#E5E8DD] pb-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: team2.color }}
                  />
                  <span className="font-display font-bold text-base text-[#1B1F1C] truncate">
                    {team2.name}
                  </span>
                  <StatusBadge tone="orange">فريق المنافس ⚔️</StatusBadge>
                </div>
                <span className="text-xs font-bold font-mono tabular-nums px-2.5 py-1 rounded-lg bg-[#F7F8F1] border border-[#E5E8DD] text-[#D9632E]">
                  {team2Picks.length} / 3 فئات
                </span>
              </div>

              {/* Team 2 Players */}
              <div className="text-xs text-[#52574E] flex items-center gap-2 flex-wrap min-h-[22px]">
                <span className="font-bold">اللاعبون:</span>
                {playersList.filter((p) => p.teamId === team2.id).length === 0 ? (
                  <span className="text-amber-700 font-bold text-[11px]">
                    بانتظار انضمام المنافس...
                  </span>
                ) : (
                  playersList
                    .filter((p) => p.teamId === team2.id)
                    .map((p) => (
                      <span
                        key={p.id}
                        className="px-2 py-0.5 rounded-md bg-[#FEF2EC] border border-[#F07842]/20 text-[#1B1F1C] font-bold text-[11px]"
                      >
                        {p.name} {p.id === playerProfile.id ? '(أنت)' : ''}
                      </span>
                    ))
                )}
              </div>

              {/* 3 Category Slots for Team 2 */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-bold text-[#52574E]">
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
                          className="p-2.5 sm:p-3 rounded-xl border border-[#F07842]/30 bg-[#FEF2EC] flex flex-col justify-between min-h-[84px] relative group"
                        >
                          <div className="text-[11px] font-bold text-[#D9632E] line-clamp-1 pl-8">
                            {subObj.mainCategory || 'فئة'}
                          </div>
                          <div className="font-display text-xs sm:text-sm font-bold text-[#1B1F1C] leading-snug line-clamp-2 text-center my-auto py-0.5">
                            {subObj.name}
                          </div>
                          {isMyTeamChoice && (
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryPick(subId)}
                              title="إلغاء اختيار هذه الفئة"
                              aria-label={`إلغاء اختيار ${subObj.name}`}
                              className="absolute top-1 left-1 min-w-[28px] min-h-[28px] rounded-lg bg-[#FFFFFF]/90 hover:bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center cursor-pointer transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={slotIdx}
                        className="p-2.5 rounded-xl border border-dashed border-[#E5E8DD] bg-[#F7F8F1] flex flex-col items-center justify-center text-center min-h-[84px] text-[#666B62]"
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
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-5">
            <div className="space-y-1">
              <StatusBadge tone="green">
                <Sparkles className="w-3.5 h-3.5 text-[#F07842]" />
                <span>دورك: اختر 3 فئات لفريقك ({myTeam?.name})</span>
              </StatusBadge>
              <h2 className="font-display text-xl font-bold text-[#1B1F1C]">
                قائمة الفئات المتاحة في نِزال
              </h2>
              <p className="text-xs text-[#52574E]">
                اضغط على أي فئة لإضافتها أو إزالتها من اختيارات فريقك. يمكنك رؤية اختيارات المنافس في الوقت الفعلي.
              </p>
            </div>

            {/* My Team Pick Counter Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[#52574E]">اختيارات فريقك:</span>
              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono tabular-nums text-white ${
                  myTeamPicks.length === 3 ? 'bg-[#14543D]' : 'bg-[#F07842]'
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
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[#666B62] pointer-events-none" />
              <input
                type="text"
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder="ابحث عن فئة معينة..."
                aria-label="ابحث عن فئة معينة"
                className="w-full min-h-[44px] pr-10 pl-10 py-2.5 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 text-xs font-bold text-[#1B1F1C] placeholder:text-[#666B62] outline-none transition-colors"
              />
              {categorySearchQuery && (
                <button
                  type="button"
                  onClick={() => setCategorySearchQuery('')}
                  aria-label="مسح البحث"
                  className="absolute left-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] rounded-lg hover:bg-[#E5E8DD]/60 text-xs text-[#52574E] hover:text-[#1B1F1C] flex items-center justify-center cursor-pointer transition-colors"
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
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-colors cursor-pointer ${
                  categoryFilterMainId === 'all'
                    ? 'bg-[#14543D] text-white shadow-xs'
                    : 'bg-[#F7F8F1] border border-[#E5E8DD] text-[#1B1F1C] hover:bg-[#E5E8DD]'
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
                      className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#14543D] text-white shadow-xs'
                          : isComingSoon
                          ? 'bg-[#FEF2EC]/70 text-[#1B1F1C] border border-[#F07842]/35 hover:bg-[#FEF2EC]'
                          : 'bg-[#F7F8F1] border border-[#E5E8DD] text-[#1B1F1C] hover:bg-[#E5E8DD]'
                      }`}
                    >
                      <span>{m.name}</span>
                      {isComingSoon && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isSelected
                              ? 'bg-[#F07842] text-white'
                              : 'bg-[#F07842]/15 text-[#D9632E]'
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-3.5 max-h-[420px] overflow-y-auto p-1">
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
                    className="p-3.5 rounded-2xl border-2 border-dashed border-[#D4D9CC] bg-[#F7F8F1] text-center transition-colors cursor-not-allowed relative flex flex-col justify-between min-h-[116px] select-none opacity-85 hover:border-[#F07842]/60"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-[#52574E] font-bold line-clamp-1">
                          {sub.mainCategory || 'تصنيف'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] font-bold inline-flex items-center gap-1 shadow-2xs">
                          <Clock className="w-2.5 h-2.5" />
                          <span>قريباً</span>
                        </span>
                      </div>

                      <div className="font-display text-sm sm:text-[15px] font-bold text-[#1B1F1C] leading-snug line-clamp-2 min-h-[2.5em] flex items-center justify-center">
                        {sub.name}
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-[11px] font-bold text-[#D9632E]">
                      <span>غير متاحة حالياً</span>
                      <Lock className="w-3.5 h-3.5 text-[#666B62]" />
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
                  className={`p-3.5 rounded-2xl border-2 text-center transition-colors cursor-pointer relative flex flex-col justify-between min-h-[116px] select-none ${
                    isPickedByMyTeam
                      ? 'bg-[#EAF2EE] border-[#14543D] ring-2 ring-[#14543D]/15 shadow-xs'
                      : 'bg-[#FFFFFF] border-[#E5E8DD] hover:border-[#14543D]/50 hover:bg-[#F7F8F1]'
                  }`}
                >
                  <div className="space-y-1.5">
                    {/* Top badging */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] text-[#14543D] font-bold line-clamp-1">
                        {sub.mainCategory || 'تصنيف'}
                      </span>
                      {isToggling && (
                        <span className="w-3.5 h-3.5 border-2 border-[#14543D] border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>

                    <div className="font-display text-sm sm:text-[15px] font-bold text-[#1B1F1C] leading-snug line-clamp-2 min-h-[2.5em] flex items-center justify-center">
                      {sub.name}
                    </div>
                  </div>

                  {/* Badges showing which team picked it */}
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-1">
                    {isPickedByTeam1 && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: team1.color }}
                      >
                        {team1.name} ✓
                      </span>
                    )}
                    {isPickedByTeam2 && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: team2.color }}
                      >
                        {team2.name} ✓
                      </span>
                    )}

                    {/* Action Hint */}
                    {isPickedByMyTeam ? (
                      <span className="text-[11px] text-[#14543D] font-bold inline-flex items-center gap-0.5">
                        <Check className="w-3.5 h-3.5" /> تم الاختيار
                      </span>
                    ) : !isPickedByTeam1 && !isPickedByTeam2 ? (
                      <span
                        className={`text-[11px] font-bold ${
                          isMyTeamFull ? 'text-[#666B62]' : 'text-[#14543D]'
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
                className="p-3 rounded-2xl border-2 border-dashed border-[#D4D9CC] bg-[#F7F8F1] text-right transition-colors cursor-not-allowed relative flex flex-col justify-between min-h-[100px] select-none opacity-90 hover:border-[#F07842]/70 overflow-hidden"
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
                    <span className="font-display text-xs font-bold text-[#1B1F1C] truncate">
                      {mainCat.name}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] font-bold inline-flex items-center gap-1 shrink-0 shadow-2xs">
                    <Clock className="w-2.5 h-2.5" />
                    <span>قريباً</span>
                  </span>
                </div>

                {(mainCat.description || mainCat.tagline) && (
                  <p className="text-[10px] text-[#52574E] line-clamp-1 mb-1">
                    {mainCat.description || mainCat.tagline}
                  </p>
                )}

                <div className="pt-1 flex items-center justify-between text-[10px] font-bold text-[#D9632E]">
                  <span>غير متاحة حالياً</span>
                  <Lock className="w-3 h-3 text-[#666B62]" />
                </div>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* 5 CONDITIONS VALIDATION & START CHALLENGE BUTTON */}
        <div className="bg-[#FFFFFF] border-2 border-[#14543D]/25 rounded-3xl p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-5 shadow-xs">
          {/* Checklist header */}
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold text-[#1B1F1C]">
              شروط بدء التحدي (5 شروط ملزمة):
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-bold pt-1">
              {/* 1. Host in */}
              <div className="p-2 rounded-xl bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/25 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-[#14543D] shrink-0" />
                <span>1. المضيف متصل</span>
              </div>

              {/* 2. Opponent in */}
              <div
                className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                  hasOpponent
                    ? 'bg-[#EAF2EE] text-[#14543D] border-[#14543D]/25'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {hasOpponent ? (
                  <Check className="w-3.5 h-3.5 text-[#14543D] shrink-0" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                )}
                <span>2. المنافس متصل</span>
              </div>

              {/* 3. Team 1 Picks */}
              <div
                className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                  team1Picks.length === 3
                    ? 'bg-[#EAF2EE] text-[#14543D] border-[#14543D]/25'
                    : 'bg-[#F7F8F1] text-[#52574E] border-[#E5E8DD]'
                }`}
              >
                {team1Picks.length === 3 ? (
                  <Check className="w-3.5 h-3.5 text-[#14543D] shrink-0" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-[#666B62] shrink-0" />
                )}
                <span>3. فئات المضيف ({team1Picks.length}/3)</span>
              </div>

              {/* 4. Team 2 Picks */}
              <div
                className={`p-2 rounded-xl border flex items-center gap-1.5 ${
                  team2Picks.length === 3
                    ? 'bg-[#EAF2EE] text-[#14543D] border-[#14543D]/25'
                    : 'bg-[#F7F8F1] text-[#52574E] border-[#E5E8DD]'
                }`}
              >
                {team2Picks.length === 3 ? (
                  <Check className="w-3.5 h-3.5 text-[#14543D] shrink-0" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-[#666B62] shrink-0" />
                )}
                <span>4. فئات المنافس ({team2Picks.length}/3)</span>
              </div>

              {/* 5. Realtime sync */}
              <div className="col-span-2 sm:col-span-1 p-2 rounded-xl bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/25 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-[#14543D] shrink-0" />
                <span>5. التزامن متصل</span>
              </div>
            </div>
          </div>

          {/* Action button row */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 border-t border-[#E5E8DD]">
            <div className="text-xs text-[#52574E] text-center sm:text-right">
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
                className={`w-full sm:w-auto min-h-[48px] px-6 sm:px-8 py-3.5 text-sm sm:text-base font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shrink-0 ${
                  isRoomReadyToStart && !loading
                    ? 'bg-[#14543D] text-[#FFFFFF] hover:bg-[#0E3F2D] cursor-pointer shadow-sm active:scale-[0.99]'
                    : 'bg-[#F3F5E9] text-[#666B62] border border-[#E5E8DD] cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جاري إطلاق المباراة...</span>
                  </div>
                ) : !hasOpponent ? (
                  <>
                    <Clock className="w-5 h-5 text-[#666B62]" />
                    <span>بانتظار دخول المنافس...</span>
                  </>
                ) : team1Picks.length < 3 ? (
                  <>
                    <Layers className="w-5 h-5 text-[#666B62]" />
                    <span>اخترت {team1Picks.length} من 3 فئات لفريقك</span>
                  </>
                ) : team2Picks.length < 3 ? (
                  <>
                    <Clock className="w-5 h-5 text-[#666B62]" />
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
                <span className="w-2.5 h-2.5 rounded-full bg-[#14543D] shrink-0" />
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
    const remainingOnlineTiles = Math.max(
      0,
      totalPlayableTiles - (currentRoom.usedTileKeys?.length || 0)
    );
    const onlineTimerTotal = Math.max(1, currentRoom.timerDuration || 60);
    const onlineTimerRatio = Math.max(
      0,
      Math.min(100, (modalTimeLeft / onlineTimerTotal) * 100)
    );

    return (
      <MotionConfig reducedMotion="user">
        <div className="max-w-[1380px] mx-auto px-3 sm:px-6 py-4 md:py-7 space-y-4 sm:space-y-6">
          {/* Offline Connection Warning Banner */}
          {!isOnline && (
            <AlertBanner tone="warning">
              انقطع الاتصال بالإنترنت — يتطلب اللعب عن بُعد اتصالاً بالإنترنت، وستعود المزامنة تلقائياً فور استعادة الاتصال.
            </AlertBanner>
          )}

          {/* Synced Real-Time Answer Feedback Overlay (Correct / Wrong) */}
          <AnimatePresence>
            {onlineAnswerFeedback && (
              <div className="pointer-events-none fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md">
                <AnswerFeedbackBanner
                  type={onlineAnswerFeedback.type}
                  headline={onlineAnswerFeedback.headline}
                  detailText={onlineAnswerFeedback.detail}
                  effectKey={onlineAnswerFeedback.eventKey}
                  effects={effects}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Toast Alert (non-answer notifications) */}
          {toastNotification && !onlineAnswerFeedback && (
            <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md bg-[#1B1F1C] text-[#FFFFFF] px-4 py-2.5 rounded-2xl shadow-lg border border-white/15 text-xs font-bold flex items-center justify-center gap-2 text-center">
              <BellRing className="w-4 h-4 text-[#F07842] shrink-0" />
              <span>{toastNotification}</span>
            </div>
          )}

          {/* TOP STATUS BAR: Teams Scores & Turn Indicator */}
          <section
            aria-label="لوحة النتائج والفرق المباشرة"
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-3.5 sm:p-5 lg:p-6 shadow-xs space-y-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-3.5">
              <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F7F8F1] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C]">
                  <span className="w-2 h-2 rounded-full bg-[#F07842]" />
                  <span>غرفة:</span>
                  <span className="font-mono">{currentRoom.code}</span>
                </span>
                <span className="text-xs font-medium text-[#52574E]">
                  {isHost
                    ? 'أنت المضيف'
                    : isSpectator
                    ? 'وضع المشاهدة (للعرض فقط)'
                    : `أنت متصل كـ ${playerProfile.name}`}
                </span>
                <span className="text-xs text-[#52574E] font-mono tabular-nums bg-[#F7F8F1] border border-[#E5E8DD] px-2.5 py-1 rounded-lg">
                  المتبقي: {remainingOnlineTiles} / {totalPlayableTiles}
                </span>
                {spectatorsList.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#14543D] tabular-nums bg-[#EAF2EE] px-2.5 py-1 rounded-lg">
                    <Eye className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>{spectatorsList.length} مشاهد</span>
                  </span>
                )}
              </div>

              {/* Turn badge & Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 ml-1">
                  <span className="text-xs font-bold text-[#52574E]">الدور الآن:</span>
                  {activeTurnTeam && (
                    <div
                      className="px-3 py-1 rounded-xl text-xs font-bold text-[#FFFFFF] flex items-center gap-1.5 shadow-2xs"
                      style={{ backgroundColor: activeTurnTeam.color }}
                    >
                      <span className="w-2 h-2 rounded-full bg-white" />
                      <span>{activeTurnTeam.name}</span>
                    </div>
                  )}
                </div>

                {!isSpectator && (
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(true)}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-xl bg-[#14543D] text-white hover:bg-[#0E3D2C] cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>دعوة للمشاهدة</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => soundFX.toggle()}
                  title={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
                  className={`min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 border transition-colors ${
                    soundEnabled
                      ? 'bg-[#EAF2EE] border-[#14543D]/20 text-[#14543D] hover:bg-[#DDECE4]'
                      : 'bg-[#F7F8F1] border-[#E5E8DD] text-[#52574E]'
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
                    className="min-h-[40px] px-3.5 py-1.5 text-xs font-bold text-white bg-[#1B1F1C] hover:bg-[#2F3530] rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <Trophy className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>إنهاء المباراة</span>
                  </button>
                )}

                {isSpectator && (
                  <button
                    type="button"
                    onClick={handleLeaveRoom}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>مغادرة المشاهدة</span>
                  </button>
                )}
              </div>
            </div>

            {/* Teams Scores Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5">
              {currentRoom.teams.map((team, idx) => {
                const isTurn = idx === currentRoom.activeTeamIndex % currentRoom.teams.length;
                return (
                  <div
                    key={team.id}
                    className={`relative overflow-hidden p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-2 ${
                      currentRoom.teams.length === 3 && idx === 2 ? 'col-span-2 md:col-span-1' : ''
                    } ${
                      isTurn
                        ? 'bg-[#FFFDF9] shadow-md'
                        : 'bg-[#F7F8F1]/80 border-[#E5E8DD] opacity-85'
                    }`}
                    style={{ borderColor: isTurn ? team.color : '#E5E8DD' }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-1"
                      style={{ backgroundColor: isTurn ? team.color : 'transparent' }}
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: team.color }}
                        />
                        <span className="font-display text-xs sm:text-sm font-bold text-[#1B1F1C] truncate">
                          {team.name}
                        </span>
                      </div>
                      {isTurn && (
                        <span className="inline-block text-[10px] font-bold text-[#F07842] bg-[#FEF2EC] px-2 py-0.5 rounded-md">
                          الدور الحالي
                        </span>
                      )}
                    </div>
                    <div className="text-left shrink-0">
                      <AnimatedScoreCounter
                        value={team.score}
                        animateOnMount={false}
                        motionEnabled={effects.motion && effects.correct}
                        showDeltaBadge={effects.correct}
                        className="font-mono text-2xl sm:text-3xl font-extrabold leading-none"
                        style={{ color: team.color }}
                      />
                      <div className="text-[10px] font-medium text-[#52574E] mt-1">
                        نقطة
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Host Exhaustion Notice if a selected category has no remaining unseen questions */}
          {isHost &&
            !questionDedupSettings?.allowRepeatAfterExhaustion &&
            (() => {
              const exhaustedCols = onlineBoardColumns.filter((col) => {
                if (
                  isWalaKalimaCategory({
                    subcategoryId: col.subId,
                    subcategoryName: col.subName,
                    mainCategoryName: col.mainCategoryName,
                  })
                ) {
                  return false;
                }
                let hasPlayableUnused = false;
                let hasExhaustedUnused = false;
                for (const pts of POINT_TIERS) {
                  const tk = `${col.subId}__${pts}`;
                  if (currentRoom.usedTileKeys.includes(tk)) continue;
                  const sl = findSlotForTile(col.subId, col.subName, pts, tk);
                  if (sl.question) hasPlayableUnused = true;
                  else if (sl.isExhausted) hasExhaustedUnused = true;
                }
                return !hasPlayableUnused && hasExhaustedUnused;
              });
              if (exhaustedCols.length === 0) return null;
              return (
                <div
                  role="status"
                  className="bg-[#FEF2EC] border border-[#F07842]/35 rounded-2xl px-5 py-3.5 flex items-center gap-2 text-xs font-semibold text-[#1B1F1C]"
                >
                  <ShieldAlert className="w-4 h-4 text-[#F07842] shrink-0" />
                  <span>
                    خلصت الأسئلة الجديدة في هذي الفئة:{' '}
                    {exhaustedCols.map((c) => c.subName).join('، ')} — لن يتم عرض أسئلة سبق أن ظهرت في حسابك.
                  </span>
                </div>
              );
            })()}

          {/* GAME BOARD: Mobile 2-Column Vertical Board + Desktop Subcategory Columns × 5 Point Rows */}
          <section
            aria-label="لوحة الأسئلة المباشرة"
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-3 sm:p-5 lg:p-6 shadow-xs space-y-4"
          >
            {/* Mobile 2-Column Board (No horizontal scrolling on phones) */}
            <div className="grid grid-cols-2 gap-3 md:hidden" data-testid="online-mobile-board">
              {onlineBoardColumns.map((col, cIdx) => {
                const isWkCol = isWalaKalimaCategory({
                  subcategoryId: col.subId,
                  subcategoryName: col.subName,
                  mainCategoryName: col.mainCategoryName,
                });
                return (
                  <div
                    key={`online_mob_${cIdx}`}
                    className="flex flex-col gap-2 min-w-0"
                  >
                    <div
                      className="relative overflow-hidden rounded-2xl p-2.5 border text-center flex flex-col items-center justify-between gap-1.5 min-h-[100px]"
                      style={{
                        backgroundColor: col.bgTint,
                        borderColor: col.borderTint,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-1"
                        style={{
                          backgroundColor: isWkCol ? '#F07842' : col.accentColor,
                        }}
                      />
                      <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#14543D] max-w-full pt-0.5">
                        <CategoryIcon
                          iconName={col.iconName}
                          color={col.accentColor}
                          className="w-3.5 h-3.5 shrink-0"
                        />
                        <span className="truncate">{col.mainCategoryName}</span>
                      </div>
                      <div className="font-display font-bold text-sm text-[#1B1F1C] line-clamp-2 leading-snug text-center">
                        {col.subName}
                      </div>
                      {isWkCol ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FEF2EC] border border-[#F07842]/30 text-[10px] font-bold text-[#D9602B]">
                          تمثيل صامت · QR
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFFFFF]/90 border border-[#E5E8DD] text-[10px] font-bold text-[#1B1F1C] max-w-full">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: col.teamColor }}
                          />
                          <span className="truncate">{col.teamName}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {POINT_TIERS.map((points) => {
                        const tileKey = `${col.subId}__${points}`;
                        const isUsed = currentRoom.usedTileKeys.includes(tileKey);
                        const isActiveSelected =
                          currentRoom.activeQuestion?.tileKey === tileKey ||
                          activeOnlineWkTile?.tileKey === tileKey;
                        const hostSlot =
                          !isUsed && !isWkCol && isHost
                            ? findSlotForTile(col.subId, col.subName, points, tileKey)
                            : null;
                        const isHostExhausted = Boolean(
                          !isWkCol && hostSlot && !hostSlot.question && hostSlot.isExhausted
                        );

                        return (
                          <button
                            key={`online_mob_${col.subId}_${points}`}
                            type="button"
                            disabled={isUsed || isHostExhausted || (!isHost && !isUsed)}
                            onClick={() =>
                              handleHostTileClick(col.subId, col.subName, points, tileKey)
                            }
                            aria-label={`${col.subName} ${points} نقطة`}
                            className={`min-h-[46px] h-12 rounded-xl border font-mono tabular-nums text-base font-extrabold transition-all flex items-center justify-center gap-1 select-none ${
                              isUsed
                                ? 'bg-[#F3F5E9]/70 border-[#E5E8DD]/70 text-[#666B62]/60 cursor-not-allowed'
                                : isActiveSelected
                                ? 'bg-[#FEF2EC] border-[#F07842] text-[#D9602B] ring-2 ring-[#F07842]/30 shadow-sm'
                                : isHostExhausted
                                ? 'bg-[#F7F8F1]/60 border-dashed border-[#E5E8DD] text-[#F07842] cursor-not-allowed text-[10px] font-sans'
                                : isHost
                                ? 'bg-[#F7F8F1] hover:bg-[#F07842] border-[#E5E8DD] hover:border-[#F07842] text-[#1B1F1C] hover:text-white shadow-2xs cursor-pointer active:scale-[0.98]'
                                : 'bg-[#F7F8F1] border-[#E5E8DD] text-[#1B1F1C]/85 cursor-default'
                            }`}
                          >
                            {isUsed ? (
                              <>
                                <Check className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                <span className="line-through text-sm">{points}</span>
                              </>
                            ) : isHostExhausted ? (
                              <span className="text-[9px] font-sans font-bold text-[#F07842] px-1 text-center leading-tight">
                                خلصت الجديدة
                              </span>
                            ) : (
                              <span>{points}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop & Tablet Classic Board */}
            <div className="hidden md:block overflow-x-auto pb-1">
              <div
                className="grid gap-3 min-w-[700px]"
                style={{
                  gridTemplateColumns: `repeat(${onlineBoardColumns.length}, minmax(136px, 1fr))`,
                }}
              >
                {/* Column Headers (Subcategories) */}
                {onlineBoardColumns.map((col, idx) => {
                  const isWkCol = isWalaKalimaCategory({
                    subcategoryId: col.subId,
                    subcategoryName: col.subName,
                    mainCategoryName: col.mainCategoryName,
                  });
                  return (
                    <div
                      key={idx}
                      className="relative overflow-hidden rounded-2xl p-3.5 border text-center flex flex-col items-center justify-between gap-2 min-h-[118px]"
                      style={{
                        backgroundColor: col.bgTint,
                        borderColor: col.borderTint,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-1"
                        style={{
                          backgroundColor: isWkCol ? '#F07842' : col.accentColor,
                        }}
                      />
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#14543D] pt-0.5">
                        <CategoryIcon
                          iconName={col.iconName}
                          color={col.accentColor}
                          className="w-3.5 h-3.5 shrink-0"
                        />
                        <span className="truncate">{col.mainCategoryName}</span>
                      </div>
                      <div className="font-display font-bold text-sm sm:text-base text-[#1B1F1C] leading-snug line-clamp-2 flex items-center justify-center text-center">
                        {col.subName}
                      </div>
                      {isWkCol ? (
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#FEF2EC] border border-[#F07842]/30 text-[10px] font-bold text-[#D9602B]">
                          تمثيل صامت · QR
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#FFFFFF]/90 border border-[#E5E8DD] text-[10px] font-bold text-[#1B1F1C] max-w-full">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: col.teamColor }}
                          />
                          <span className="truncate max-w-[100px]">{col.teamName}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 5 Point Rows (100, 200, 300, 400, 500) */}
                {POINT_TIERS.map((points) => (
                  <React.Fragment key={points}>
                    {onlineBoardColumns.map((col) => {
                      const tileKey = `${col.subId}__${points}`;
                      const isUsed = currentRoom.usedTileKeys.includes(tileKey);
                      const isActiveSelected =
                        currentRoom.activeQuestion?.tileKey === tileKey ||
                        activeOnlineWkTile?.tileKey === tileKey;
                      const isWkCol = isWalaKalimaCategory({
                        subcategoryId: col.subId,
                        subcategoryName: col.subName,
                        mainCategoryName: col.mainCategoryName,
                      });
                      const hostSlot =
                        !isUsed && !isWkCol && isHost
                          ? findSlotForTile(col.subId, col.subName, points, tileKey)
                          : null;
                      const isHostExhausted = Boolean(
                        !isWkCol && hostSlot && !hostSlot.question && hostSlot.isExhausted
                      );

                      return (
                        <button
                          key={`${col.subId}_${points}`}
                          type="button"
                          disabled={isUsed || isHostExhausted || (!isHost && !isUsed)}
                          title={
                            isHostExhausted
                              ? 'خلصت الأسئلة الجديدة في هذي الفئة'
                              : undefined
                          }
                          onClick={() =>
                            handleHostTileClick(col.subId, col.subName, points, tileKey)
                          }
                          className={`h-18 md:h-20 rounded-2xl border font-mono tabular-nums text-xl md:text-2xl font-extrabold transition-all duration-150 flex flex-col items-center justify-center select-none ${
                            isUsed
                              ? 'bg-[#F3F5E9]/70 border-[#E5E8DD]/70 text-[#666B62]/60 cursor-not-allowed'
                              : isActiveSelected
                              ? 'bg-[#FEF2EC] border-[#F07842] text-[#D9602B] ring-2 ring-[#F07842]/30 shadow-sm'
                              : isHostExhausted
                              ? 'bg-[#F7F8F1]/60 border-dashed border-[#E5E8DD] text-[#F07842] cursor-not-allowed text-xs font-sans'
                              : isHost
                              ? 'bg-[#F7F8F1] hover:bg-[#F07842] border-[#E5E8DD] hover:border-[#F07842] text-[#1B1F1C] hover:text-white hover:-translate-y-0.5 hover:shadow-md cursor-pointer active:translate-y-0 active:scale-[0.98]'
                              : 'bg-[#F7F8F1] border-[#E5E8DD] text-[#1B1F1C]/85 cursor-default'
                          }`}
                        >
                          {isUsed ? (
                            <div className="flex flex-col items-center leading-none gap-1">
                              <span className="line-through text-base md:text-xl">
                                {points}
                              </span>
                              <span className="text-[10px] font-sans font-semibold no-underline inline-flex items-center gap-0.5">
                                <Check className="w-3 h-3" />
                                مُستخدم
                              </span>
                            </div>
                          ) : isHostExhausted ? (
                            <span className="text-[10px] font-sans font-bold text-[#F07842] px-1 text-center leading-tight">
                              خلصت الأسئلة الجديدة
                            </span>
                          ) : (
                            <span>{points}</span>
                          )}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Bottom notice for non-hosts */}
            {!isHost && (
              <div className="pt-2 text-center text-xs font-bold text-[#52574E]">
                المضيف ({currentRoom.hostName}) هو من يملك صلاحية فتح الأسئلة وتسجيل النقاط.
              </div>
            )}
          </section>

        {/* SYNCHRONIZED WALA KALIMA QR MODAL (HOST OR SYNCED ROOM PLAYERS) */}
        {(activeOnlineWkTile || currentRoom.activeQuestion?.isWalaKalima) && (() => {
          const aq = currentRoom.activeQuestion;
          const activeTurnIdx = currentRoom.activeTeamIndex % currentRoom.teams.length;
          const targetTeam = currentRoom.teams[activeTurnIdx] || currentRoom.teams[0];
          const teamRoster = Object.values(currentRoom.players || {})
            .filter((p) => p.teamId === targetTeam?.id)
            .map((p) => p.name);
          const wkTile = activeOnlineWkTile || {
            subId: aq?.subcategoryId || '',
            subName: aq?.subcategoryName || 'ولا كلمة',
            points: (aq?.points as PointValue) || 100,
            tileKey: aq?.tileKey || '',
          };

          return (
            <WalaKalimaBoardModal
              matchId={`online_${currentRoom.code}`}
              tileKey={wkTile.tileKey}
              subcategoryId={wkTile.subId}
              subcategoryName={wkTile.subName}
              initialPoints={wkTile.points}
              preferredDifficulty={POINT_TO_DIFFICULTY[wkTile.points]}
              activeTeam={{
                id: targetTeam?.id || 'team_1',
                name: targetTeam?.name || 'الفريق الحالي',
                color: targetTeam?.color || '#14543D',
                players: teamRoster,
              }}
              teams={currentRoom.teams}
              canControl={isHost}
              settings={walaKalimaSettings}
              sharedOnlineSession={aq?.walaKalimaMeta || null}
              onOnlineSessionCreated={async (created) => {
                if (!isHost) return;
                await hostSelectQuestion(currentRoom.code, currentRoom.hostId, {
                  tileKey: wkTile.tileKey,
                  questionId: created.sessionId,
                  subcategoryId: wkTile.subId,
                  subcategoryName: wkTile.subName,
                  category: 'ولا كلمة',
                  points: wkTile.points,
                  difficulty: POINT_TO_DIFFICULTY[wkTile.points],
                  questionText: `جولة ولا كلمة — ${created.contentTypeLabel}`,
                  correctAnswer: '',
                  isAnswerRevealed: false,
                  openedAt: Date.now(),
                  openedByHostId: currentRoom.hostId,
                  isWalaKalima: true,
                  walaKalimaMeta: {
                    sessionId: created.sessionId,
                    qrPath: created.qrPath,
                    teamId: created.teamId,
                    teamName: created.teamName,
                    playerName: created.playerName,
                    contentTypeLabel: created.contentTypeLabel,
                    status: created.status,
                    correctCount: created.correctCount,
                    skippedCount: created.skippedCount,
                    maxSkips: created.maxSkips,
                    remainingSkips: created.remainingSkips,
                    pointsPerCorrectWord: created.pointsPerCorrectWord,
                    earnedPoints: created.earnedPoints,
                    totalWords: created.totalWords,
                    timerSeconds: created.timerSeconds,
                    serverNow: created.serverNow,
                    startedAt: created.startedAt,
                    expiresAt: created.expiresAt,
                    endReason: created.endReason,
                  },
                });
              }}
              onOnlineSessionStatusSync={async (status) => {
                if (!isHost || !currentRoom.activeQuestion?.isWalaKalima) return;
                await hostSelectQuestion(currentRoom.code, currentRoom.hostId, {
                  ...currentRoom.activeQuestion,
                  walaKalimaMeta: {
                    ...currentRoom.activeQuestion.walaKalimaMeta,
                    sessionId: status.sessionId,
                    teamId: status.teamId,
                    teamName: status.teamName,
                    playerName: status.playerName,
                    contentTypeLabel: status.contentTypeLabel,
                    status: status.status,
                    correctCount: status.correctCount,
                    skippedCount: status.skippedCount,
                    maxSkips: status.maxSkips,
                    remainingSkips: status.remainingSkips,
                    pointsPerCorrectWord: status.pointsPerCorrectWord,
                    earnedPoints: status.earnedPoints,
                    totalWords: status.totalWords,
                    timerSeconds: status.timerSeconds,
                    serverNow: status.serverNow,
                    startedAt: status.startedAt,
                    expiresAt: status.expiresAt,
                    endReason: status.endReason,
                  },
                });
              }}
              onCommitResult={async ({ awardedTeamIndex, earnedPoints, tileKey, sessionId }) => {
                if (!isHost) return;
                if ((currentRoom.usedTileKeys || []).includes(tileKey)) {
                  setActiveOnlineWkTile(null);
                  return;
                }
                const totalTiles = currentRoom.selectedSubcategoryIds.length * 5;
                if (awardedTeamIndex !== null && earnedPoints > 0) {
                  await hostAwardPoints({
                    code: currentRoom.code,
                    hostId: currentRoom.hostId,
                    awardedTeamIndex,
                    points: earnedPoints,
                    tileKey,
                    questionId: sessionId,
                    totalPlayableTiles: totalTiles,
                  });
                } else {
                  await hostMarkTileNoPoints({
                    code: currentRoom.code,
                    hostId: currentRoom.hostId,
                    tileKey,
                    questionId: sessionId,
                    totalPlayableTiles: totalTiles,
                  });
                }
                setActiveOnlineWkTile(null);
              }}
              onCancel={async () => {
                if (isHost && currentRoom.activeQuestion?.isWalaKalima) {
                  await closeOnlineActiveQuestion(currentRoom.code, currentRoom.hostId);
                }
                setActiveOnlineWkTile(null);
              }}
            />
          );
        })()}

        {/* SYNCHRONIZED QUESTION MODAL (POPS UP FOR ALL PLAYERS IN REAL TIME) */}
        {currentRoom.activeQuestion && !currentRoom.activeQuestion.isWalaKalima && (() => {
          const aq = currentRoom.activeQuestion;
          const isAudioWaiting = inferQuestionMediaType(aq) === 'audio' && !onlineAudioReady;

          return (
            <div
              className="fixed inset-0 z-50 bg-[#1B1F1C]/75 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-label={`سؤال ${aq.subcategoryName} بقيمة ${aq.points} نقطة`}
            >
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl overflow-hidden max-w-2xl w-full max-h-[94dvh] flex flex-col shadow-2xl">
                {/* Dark Charcoal Modal Header */}
                <div className="bg-[#1B1F1C] text-white px-3.5 sm:px-6 py-2.5 sm:py-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/10 text-white border border-white/15 truncate max-w-[160px] sm:max-w-none">
                      {aq.subcategoryName}
                    </span>
                    <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-white bg-[#F07842] px-2 sm:px-2.5 py-1 rounded-lg">
                      {aq.points} نقطة
                    </span>
                    {inferQuestionMediaType(aq) === 'audio' ? (
                      <span className="text-[11px] sm:text-xs font-bold text-white/80 flex items-center gap-1">
                        <Volume2 className="w-3.5 h-3.5 text-[#F07842]" />
                        <span>سؤال صوتي</span>
                      </span>
                    ) : inferQuestionMediaType(aq) === 'image' ? (
                      <span className="text-[11px] sm:text-xs font-bold text-white/80 flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5 text-[#F07842]" />
                        <span>سؤال صورة</span>
                      </span>
                    ) : null}
                  </div>

                  {/* Countdown Timer */}
                  <div
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-mono tabular-nums text-xs sm:text-sm font-bold transition-colors ${
                      isAudioWaiting
                        ? 'bg-white/15 text-white'
                        : modalTimeLeft === 0
                        ? 'bg-rose-600 text-white'
                        : modalTimeLeft <= 10
                        ? 'bg-[#F07842] text-white'
                        : 'bg-white/12 text-white'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>
                      {isAudioWaiting
                        ? `متوقف (${modalTimeLeft}ث)`
                        : modalTimeLeft === 0
                        ? 'انتهى (0ث)'
                        : `${modalTimeLeft}ث`}
                    </span>
                  </div>
                </div>

                {/* Remaining Time Progress Bar */}
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full bg-[#E5E8DD] overflow-hidden shrink-0"
                >
                  <div
                    className={`h-full transition-all duration-500 ease-linear ${
                      modalTimeLeft === 0
                        ? 'bg-rose-600'
                        : modalTimeLeft <= 10
                        ? 'bg-[#F07842]'
                        : 'bg-[#14543D]'
                    }`}
                    style={{ width: `${onlineTimerRatio}%` }}
                  />
                </div>

                <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
                  {/* Question Body */}
                  <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-2xl p-4 sm:p-7 space-y-3 sm:space-y-4 text-center">
                    <h3 className="font-display text-base sm:text-xl md:text-2xl font-bold text-[#1B1F1C] leading-relaxed">
                      {aq.questionText}
                    </h3>

                    {/* Optional Question Image with Error Retry & Zoom */}
                    {inferQuestionMediaType(aq) === 'image' && aq.imageUrl && (
                      onlineImageLoadFailed ? (
                        <div className="bg-[#FFFFFF] border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-right">
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-rose-800">
                              تعذر تحميل صورة السؤال
                            </div>
                            <p className="text-[11px] text-rose-700/90">
                              تأكد من الاتصال ثم اضغط على «إعادة المحاولة».
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setOnlineImageLoadFailed(false);
                              setOnlineImageRetryNonce((n) => n + 1);
                            }}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>إعادة المحاولة</span>
                          </button>
                        </div>
                      ) : (
                        <div className="max-w-lg mx-auto rounded-2xl overflow-hidden border border-[#E5E8DD] bg-[#FFFFFF] p-2.5 space-y-2">
                          <div className="relative flex items-center justify-center">
                            <img
                              key={`${aq.imageUrl}_${onlineImageRetryNonce}`}
                              src={aq.imageUrl}
                              referrerPolicy="no-referrer"
                              alt={aq.imageDescription || 'صورة السؤال'}
                              onError={() => setOnlineImageLoadFailed(true)}
                              onClick={() => setOnlineZoomedImageUrl(aq.imageUrl || null)}
                              className="w-full max-h-[175px] sm:max-h-72 object-contain rounded-xl bg-[#FFFFFF] cursor-zoom-in"
                            />
                            <button
                              type="button"
                              onClick={() => setOnlineZoomedImageUrl(aq.imageUrl || null)}
                              className="absolute bottom-2 left-2 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1B1F1C]/85 hover:bg-[#1B1F1C] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              title="تكبير الصورة"
                            >
                              <ZoomIn className="w-3.5 h-3.5" />
                              <span>تكبير</span>
                            </button>
                          </div>
                          {aq.imageDescription && (
                            <p className="text-xs text-[#52574E] text-center">
                              {aq.imageDescription}
                            </p>
                          )}
                        </div>
                      )
                    )}

                    {/* Question Audio Player */}
                    {inferQuestionMediaType(aq) === 'audio' && aq.audioUrl && (
                      <QuestionAudioPlayer
                        audioUrl={aq.audioUrl}
                        maxPlays={aq.audioMaxPlays ?? null}
                        questionKey={`online_${currentRoom.code}_${aq.tileKey}_${aq.openedAt}`}
                        onReadyChange={(ready) => {
                          setOnlineAudioReady(ready);
                          if (ready && audioLoadingStartedAtRef.current) {
                            setOnlineAudioLoadWaitMs(
                              Math.max(0, Date.now() - audioLoadingStartedAtRef.current)
                            );
                            audioLoadingStartedAtRef.current = null;
                          } else if (!ready && !audioLoadingStartedAtRef.current) {
                            audioLoadingStartedAtRef.current = Date.now();
                          }
                        }}
                      />
                    )}
                  </div>

                  {/* Answer Area */}
                  {aq.isAnswerRevealed ? (
                    <div className="p-4 sm:p-5 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/30 text-center space-y-1.5">
                      <div className="text-xs font-bold text-[#14543D]">
                        الإجابة الصحيحة:
                      </div>
                      <div className="font-display text-xl sm:text-2xl font-bold text-[#1B1F1C]">
                        {aq.correctAnswer}
                      </div>
                      {aq.explanation && (
                        <p className="text-xs text-[#52574E] pt-1 leading-relaxed">
                          {aq.explanation}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-[#F7F8F1] border border-[#E5E8DD] text-center space-y-2">
                      <div className="text-xs font-bold text-[#52574E]">
                        الإجابة مخفية عن الجميع حالياً
                      </div>

                      {isHost ? (
                        <div className="space-y-2">
                          <div className="text-xs text-[#52574E]">
                            يمكنك التحقق من الإجابة بشكل خاص على شاشتك دون كشفها للاعبين.
                          </div>
                          <button
                            type="button"
                            onClick={() => setHostAnswerPeek((p) => !p)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#F07842] text-xs font-bold text-[#1B1F1C] cursor-pointer transition-colors"
                          >
                            {hostAnswerPeek ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5 text-[#F07842]" />
                                <span>إخفاء المعاينة الخاصة</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5 text-[#14543D]" />
                                <span>معاينة الإجابة للمضيف فقط</span>
                              </>
                            )}
                          </button>
                          {hostAnswerPeek && (
                            <div className="mt-2 p-3 rounded-xl bg-[#FFFFFF] border border-[#14543D]/30 text-sm font-bold text-[#1B1F1C]">
                              {aq.correctAnswer}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-[#52574E]">
                          بانتظار المضيف لكشف الإجابة...
                        </div>
                      )}
                    </div>
                  )}

                  {/* ACTION BUTTONS */}
                  {isHost ? (
                    <div className="space-y-3 pt-1">
                      {!aq.isAnswerRevealed ? (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={handleHostReveal}
                          className="w-full min-h-[50px] py-3.5 text-sm sm:text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] disabled:opacity-50 rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-colors"
                        >
                          <Eye className="w-5 h-5 text-white" />
                          <span>إظهار الإجابة للجميع</span>
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <WhoAnsweredCorrectlyPanel
                            teams={currentRoom.teams}
                            points={aq.points}
                            disabled={actionBusy}
                            pendingChoice={pendingHostChoice}
                            onSelectTeam={(tIdx) => void handleHostAward(tIdx)}
                            onSelectNoTeam={() => void handleHostSkip()}
                          />

                          <div className="flex justify-center pt-1">
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() =>
                                hostCloseActiveQuestion(
                                  currentRoom.code,
                                  currentRoom.hostId
                                )
                              }
                              className="min-h-[40px] py-2 px-4 rounded-xl border border-[#E5E8DD] text-xs font-bold text-[#52574E] hover:text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              إغلاق بدون احتساب السؤال
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isSpectator ? (
                    <div className="pt-2 text-center text-xs font-bold text-[#14543D] bg-[#EAF2EE] py-3 px-4 rounded-xl border border-[#14543D]/15">
                      تتابع السؤال الآن بوضع المشاهد (للعرض فقط — يتم تحديث الإجابة والنقاط مباشرة).
                    </div>
                  ) : aq.isAnswerRevealed ? (
                    <div className="pt-2 text-center text-xs font-bold text-[#14543D] bg-[#EAF2EE] py-3 px-4 rounded-xl border border-[#14543D]/15">
                      تم كشف الإجابة — يحدد المضيف الآن «مين جاوب صح؟»...
                    </div>
                  ) : (
                    /* Non-Host Player Interactive Buttons */
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handlePlayerBuzz('buzz_in')}
                        className="flex-1 w-full min-h-[48px] py-3 text-xs sm:text-sm font-bold rounded-xl bg-[#F07842] text-[#FFFFFF] hover:bg-[#D9632E] cursor-pointer flex items-center justify-center gap-2 transition-colors shadow-xs"
                      >
                        <Hand className="w-4 h-4 text-white" />
                        <span>أنا جاهز للإجابة! (رفع اليد)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePlayerBuzz('reveal_answer')}
                        className="min-h-[48px] py-3 px-4 rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F7F8F1] text-xs font-bold text-[#1B1F1C] cursor-pointer transition-colors"
                      >
                        طلب كشف الإجابة 📢
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {onlineZoomedImageUrl && currentRoom.activeQuestion && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-[#1B1F1C]/92 backdrop-blur-xs"
            onClick={() => setOnlineZoomedImageUrl(null)}
            role="dialog"
            aria-modal="true"
            aria-label="عرض صورة السؤال بالحجم الكامل"
          >
            <div
              className="relative max-w-5xl max-h-[92dvh] flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOnlineZoomedImageUrl(null)}
                className="self-end min-h-[44px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>إغلاق التكبير</span>
              </button>
              <img
                src={onlineZoomedImageUrl}
                referrerPolicy="no-referrer"
                alt={currentRoom.activeQuestion.imageDescription || 'صورة السؤال مكبرة'}
                className="max-h-[82dvh] max-w-[94vw] w-auto object-contain rounded-2xl border border-white/20 bg-[#FFFFFF] p-2 shadow-2xl"
              />
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
      </MotionConfig>
    );
  }

  // -------------------------------------------------------------
  // RENDER: 4. RESULTS SCREEN (نهاية المباراة)
  // -------------------------------------------------------------
  const onlineOutcome = evaluateMatchOutcome(currentRoom.teams);
  const onlineCelebrationKey = `online_${currentRoom.code}_${currentRoom.updatedAt || currentRoom.usedTileKeys.length}_${onlineOutcome.sortedTeams
    .map((t) => `${t.id}:${t.score}`)
    .join('_')}`;

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={effects.motion ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[840px] mx-auto px-3 sm:px-6 py-6 md:py-12 text-center space-y-6"
      >
        <div
          className={`relative overflow-hidden bg-[#FFFFFF] border rounded-3xl p-4 sm:p-8 md:p-11 space-y-6 shadow-xl ${
            onlineOutcome.isTie ? 'border-amber-300' : 'border-[#E5E8DD]'
          }`}
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              backgroundColor: onlineOutcome.isTie
                ? '#F59E0B'
                : onlineOutcome.isZeroScore
                ? '#E5E8DD'
                : onlineOutcome.singleWinner?.color || '#F07842',
            }}
          />

          <MatchCelebrationHeader
            outcome={onlineOutcome}
            celebrationKey={onlineCelebrationKey}
            subtitleMeta={`أونلاين · غرفة ${currentRoom.code}`}
            effects={effects}
          />

          {/* Final Scoreboard */}
          <div className="space-y-3 pt-1 max-w-lg mx-auto text-right">
            {onlineOutcome.sortedTeams.map((team, idx) => {
              const isTop = team.score === onlineOutcome.topScore && onlineOutcome.topScore > 0;
              const rankNum = onlineOutcome.teamRanks[idx] ?? idx + 1;
              return (
                <motion.div
                  key={team.id}
                  initial={
                    effects.motion && effects.winner
                      ? { opacity: 0, y: 10 }
                      : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.26,
                    delay: effects.motion ? Math.min(idx * 0.08, 0.32) : 0,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 transition-shadow ${
                    isTop
                      ? onlineOutcome.isTie
                        ? 'bg-[#FFFBEB] border-amber-300 shadow-sm'
                        : 'bg-[#F7F8F1] border-[#F07842]/50 shadow-sm'
                      : 'bg-[#FFFFFF] border-[#E5E8DD]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-mono tabular-nums font-extrabold text-sm text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: team.color }}
                    >
                      #{rankNum}
                    </span>
                    <span className="font-display font-bold text-sm sm:text-base text-[#1B1F1C] truncate">
                      {team.name}
                    </span>
                    {isTop && (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          onlineOutcome.isTie
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-[#FEF2EC] text-[#F07842]'
                        }`}
                      >
                        {onlineOutcome.isTie ? '★ متعادل' : '★ الفائز'}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xl sm:text-2xl font-extrabold shrink-0 flex items-center gap-1" style={{ color: team.color }}>
                    <AnimatedScoreCounter
                      value={team.score}
                      animateOnMount
                      motionEnabled={effects.motion && effects.winner}
                      durationMs={600}
                    />
                    <span className="text-[11px] font-sans font-medium text-[#52574E]">نقطة</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Action Controls */}
          <div className="pt-5 border-t border-[#E5E8DD] flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3">
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={() => hostRestartGame(currentRoom.code, currentRoom.hostId, false)}
                  className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 rounded-xl bg-[#F07842] text-[#FFFFFF] text-sm font-bold hover:bg-[#D9632E] cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>جولة جديدة بنفس الغرفة</span>
                </button>

                <button
                  type="button"
                  onClick={() => hostRestartGame(currentRoom.code, currentRoom.hostId, true)}
                  className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 rounded-xl bg-[#1B1F1C] text-[#FFFFFF] text-sm font-bold hover:bg-[#2F3530] cursor-pointer flex items-center justify-center transition-colors"
                >
                  العودة لصالة الانتظار
                </button>
              </>
            ) : isSpectator ? (
              <div className="text-xs font-bold text-[#52574E]">
                انتهت المباراة — كنت تشاهد هذه المواجهة كمشاهد.
              </div>
            ) : (
              <div className="text-xs font-bold text-[#52574E]">
                بانتظار المضيف لإعادة بدء جولة جديدة أو العودة للانتظار.
              </div>
            )}

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{isSpectator ? 'مغادرة المشاهدة' : 'مغادرة الغرفة'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </MotionConfig>
  );
};
