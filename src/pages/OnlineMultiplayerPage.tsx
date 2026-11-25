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
  Clock,
  Sparkles,
  Volume2,
  VolumeX,
  Radio,
  Eye,
  BellRing,
  Layers,
  Search,
  X,
  CheckCircle2,
  Lock,
  Flame,
  ShieldAlert,
  Image as ImageIcon,
  ZoomIn,
  RefreshCw,
  Trophy,
  Send,
  History,
  ArrowLeftRight,
  SkipForward,
  Edit3,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  OnlineGameRoom,
  RoomEventEntry,
  TurnRole,
} from '../types/multiplayer';
import {
  MainCategoryMeta,
  PageView,
  PointValue,
  POINT_TO_DIFFICULTY,
  QuestionDedupSettings,
  SubcategoryItem,
  TriviaQuestion,
  VisualEffectsSettings,
} from '../types/game';
import {
  claimOnlineHost,
  clearActiveOnlineRoomCode,
  commitOnlineWalaKalimaResult,
  confirmOnlineCategories,
  createOnlineRoom,
  DEFAULT_ONLINE_TEAMS,
  dismissResolvedOnlineQuestion,
  fetchOnlineRoom,
  getActiveOnlineRoomSession,
  getOrCreatePlayerProfile,
  hostFinishGame,
  hostRestartGame,
  hostStartGame,
  joinOnlineRoom,
  joinOnlineRoomAsSpectator,
  leaveOnlineRoom,
  saveActiveOnlineRoomCode,
  savePlayerName,
  selectOnlineQuestion,
  submitOnlineAnswer,
  subscribeToOnlineRoom,
  syncOnlineWalaKalimaState,
  timeoutOrSkipOnlineQuestion,
  toggleOnlineSubcategoryPick,
  updateOnlinePlayerPresence,
} from '../services/multiplayerService';
import { DEFAULT_SUBCATEGORIES } from '../data/categoriesAndSeed';
import { CategoryIcon } from '../components/CategoryIcon';
import { InviteFriendsModal } from '../components/InviteFriendsModal';
import { QuestionAudioPlayer } from '../components/QuestionAudioPlayer';
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

function formatEventTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const OnlineMultiplayerPage: React.FC<OnlineMultiplayerPageProps> = ({
  user,
  mainCategories,
  subcategories,
  approvedQuestions,
  seenQuestionIds,
  questionDedupSettings = DEFAULT_QUESTION_DEDUP_SETTINGS,
  onRecordQuestionSeen,
  onNavigateHome,
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

  const [playerProfile, setPlayerProfile] = useState(() =>
    getOrCreatePlayerProfile(user)
  );

  // Entry screen state
  const [entryMode, setEntryMode] = useState<'create' | 'join'>('create');
  const [roomCodeInput, setRoomCodeInput] = useState<string>(
    initialRoomCode ? initialRoomCode.toUpperCase() : ''
  );
  const [playerNameInput, setPlayerNameInput] = useState<string>(
    playerProfile.name || ''
  );
  const [timerDuration, setTimerDuration] = useState<number>(60);
  const [customTeams, setCustomTeams] = useState<{ name: string; color: string }[]>(
    DEFAULT_ONLINE_TEAMS.map((t) => ({ name: t.name, color: t.color }))
  );
  const [joinRole, setJoinRole] = useState<'player' | 'spectator'>(initialJoinRole);

  // Active room state
  const [currentRoom, setCurrentRoom] = useState<OnlineGameRoom | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // Lobby selection & search state
  const [categoryFilterMainId, setCategoryFilterMainId] = useState<string>('all');
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [isTogglingSubId, setIsTogglingSubId] = useState<string | null>(null);
  const [isConfirmingBusy, setIsConfirmingBusy] = useState<boolean>(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState<boolean>(false);

  // Active question interaction & timer
  const [answerDraft, setAnswerDraft] = useState<string>('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState<boolean>(false);
  const [isDismissingResult, setIsDismissingResult] = useState<boolean>(false);
  const [modalTimeLeft, setModalTimeLeft] = useState<number>(60);
  const [onlineImageLoadFailed, setOnlineImageLoadFailed] = useState<boolean>(false);
  const [onlineImageRetryNonce, setOnlineImageRetryNonce] = useState<number>(0);
  const [onlineZoomedImageUrl, setOnlineZoomedImageUrl] = useState<string | null>(null);
  const [onlineAudioReady, setOnlineAudioReady] = useState<boolean>(true);
  const [onlineAudioLoadWaitMs, setOnlineAudioLoadWaitMs] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundFX.isEnabled());
  const [onlineAnswerFeedback, setOnlineAnswerFeedback] = useState<{
    type: 'correct' | 'wrong';
    headline: string;
    detail: string;
    eventKey: string;
  } | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const audioLoadingStartedAtRef = useRef<number | null>(null);
  const onlineFeedbackTimerRef = useRef<number | null>(null);
  const autoTimeoutFiredKeyRef = useRef<string | null>(null);
  const autoReconnectAttemptedRef = useRef<boolean>(false);
  const prevModalTimeLeftRef = useRef<number>(60);
  const prevRoomSyncRef = useRef<{
    code: string;
    status: string;
    openedAt: number | null;
    submissionStatus: string | null;
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

  useEffect(() => {
    const p = getOrCreatePlayerProfile(user);
    setPlayerProfile(p);
    if (!playerNameInput) {
      setPlayerNameInput(p.name);
    }
  }, [user]);

  useEffect(() => {
    if (initialRoomCode && initialRoomCode.trim()) {
      setRoomCodeInput(initialRoomCode.trim().toUpperCase());
      setJoinRole(initialJoinRole || 'player');
      setEntryMode('join');
    }
  }, [initialRoomCode, initialJoinRole]);

  useEffect(() => {
    return () => {
      if (onlineFeedbackTimerRef.current !== null) {
        window.clearTimeout(onlineFeedbackTimerRef.current);
      }
    };
  }, []);

  // Connect to room stream
  const connectToRoomStream = useCallback(
    (roomCode: string) => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      const unsub = subscribeToOnlineRoom(
        roomCode,
        (updatedRoom) => {
          if (!updatedRoom) {
            setErrorMsg('تم إغلاق الغرفة أو أنها لم تعد متوفرة.');
            clearActiveOnlineRoomCode();
            setCurrentRoom(null);
            return;
          }
          setCurrentRoom(updatedRoom);

          // Auto-save match progress for active players
          const myUid = user?.uid || playerProfile.id;
          if (
            user &&
            updatedRoom.players?.[myUid] &&
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
                    points: (updatedRoom.activeQuestion.points as PointValue) || 100,
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
    },
    [user, playerProfile.id]
  );

  // Seamless reconnection after reload/disconnect
  useEffect(() => {
    if (!user || autoJoinNonce || initialRoomCode || currentRoom || autoReconnectAttemptedRef.current) {
      return;
    }
    const saved = getActiveOnlineRoomSession();
    if (!saved || (saved.uid && saved.uid !== user.uid)) {
      return;
    }
    // Expire stale saved session older than 12 hours
    if (saved.savedAt && Date.now() - saved.savedAt > 12 * 60 * 60 * 1000) {
      clearActiveOnlineRoomCode();
      return;
    }

    autoReconnectAttemptedRef.current = true;
    let cancelled = false;

    const tryReconnect = async () => {
      setIsReconnecting(true);
      try {
        const existing = await fetchOnlineRoom(saved.code);
        if (!existing || cancelled) {
          clearActiveOnlineRoomCode();
          return;
        }
        const isMember =
          existing.hostUid === user.uid ||
          existing.hostId === user.uid ||
          existing.guestUid === user.uid ||
          existing.guestId === user.uid ||
          Boolean(existing.players?.[user.uid]);

        const displayName =
          user.displayName || user.email?.split('@')[0] || playerProfile.name || 'لاعب';

        if (saved.role === 'spectator' && !isMember) {
          if (existing.status === 'finished' || existing.status === 'completed') {
            clearActiveOnlineRoomCode();
            return;
          }
          const { room } = await joinOnlineRoomAsSpectator({
            code: saved.code,
            spectatorName: displayName,
            user,
          });
          if (!cancelled) {
            setCurrentRoom(room);
            connectToRoomStream(room.code);
          }
        } else if (isMember) {
          if (existing.status === 'finished' || existing.status === 'completed') {
            if (!cancelled) {
              setCurrentRoom(existing);
              connectToRoomStream(existing.code);
            }
          } else {
            const { room } = await joinOnlineRoom({
              code: saved.code,
              playerName: existing.players?.[user.uid]?.name || displayName,
              user,
            });
            if (!cancelled) {
              setCurrentRoom(room);
              connectToRoomStream(room.code);
            }
          }
        } else {
          clearActiveOnlineRoomCode();
        }
      } catch {
        clearActiveOnlineRoomCode();
      } finally {
        if (!cancelled) setIsReconnecting(false);
      }
    };

    void tryReconnect();
    return () => {
      cancelled = true;
    };
  }, [user, autoJoinNonce, initialRoomCode, currentRoom, connectToRoomStream, playerProfile.name]);

  // Auto-join room when triggered from Friend Invite or Notification Center
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
      if (unsubscribeRef.current) unsubscribeRef.current();
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      if (onPresenceActivityChange) onPresenceActivityChange('online', null);
    };
  }, []);

  // Computed identities & roles
  const myUid = user?.uid || playerProfile.id;
  const hostUid = currentRoom ? currentRoom.hostUid || currentRoom.hostId : '';
  const guestUid = currentRoom ? currentRoom.guestUid || currentRoom.guestId || null : null;

  const isHost = Boolean(currentRoom && myUid === hostUid);
  const isGuest = Boolean(currentRoom && guestUid && myUid === guestUid);
  const myRole: TurnRole | null = isHost ? 'host' : isGuest ? 'guest' : null;
  const isSpectator = Boolean(
    currentRoom && !myRole && currentRoom.spectators?.[myUid]
  );

  const activeTurnRole: TurnRole = useMemo(() => {
    if (!currentRoom) return 'host';
    if (currentRoom.activeTurnRole === 'host' || currentRoom.activeTurnRole === 'guest') {
      return currentRoom.activeTurnRole;
    }
    return (currentRoom.activeTeamIndex || 0) % 2 === 0 ? 'host' : 'guest';
  }, [currentRoom]);

  const isMyTurn = Boolean(myRole && myRole === activeTurnRole);

  // Active question timer
  useEffect(() => {
    const aq = currentRoom?.activeQuestion;
    if (!aq || aq.submissionStatus === 'resolved') {
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

  // Timer tick & auto-timeout close
  useEffect(() => {
    const q = currentRoom?.activeQuestion;
    const isAudioWaiting = Boolean(q) && inferQuestionMediaType(q) === 'audio' && !onlineAudioReady;
    if (!q || q.isWalaKalima || q.submissionStatus === 'resolved' || q.isAnswerRevealed || isAudioWaiting) {
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

    // Auto-resolve on timeout when timer hits 0
    if (modalTimeLeft === 0 && currentRoom?.code && !isSpectator && myRole) {
      const timeoutKey = `${currentRoom.code}__${q.tileKey}__${q.openedAt}`;
      if (autoTimeoutFiredKeyRef.current !== timeoutKey) {
        const delayMs = isMyTurn ? 150 : 2000;
        const t = window.setTimeout(() => {
          if (autoTimeoutFiredKeyRef.current === timeoutKey) return;
          autoTimeoutFiredKeyRef.current = timeoutKey;
          void timeoutOrSkipOnlineQuestion(currentRoom.code).catch(() => {});
        }, delayMs);
        return () => window.clearTimeout(t);
      }
    }
  }, [modalTimeLeft, currentRoom?.activeQuestion, currentRoom?.code, onlineAudioReady, isMyTurn, isSpectator, myRole]);

  // Reset question draft & media readiness when active question changes
  useEffect(() => {
    setAnswerDraft('');
    setIsSubmittingAnswer(false);
    setIsDismissingResult(false);
    setOnlineImageLoadFailed(false);
    setOnlineImageRetryNonce(0);
    setOnlineZoomedImageUrl(null);
    const aq = currentRoom?.activeQuestion;
    const isAudioQ = inferQuestionMediaType(aq) === 'audio';
    setOnlineAudioReady(!isAudioQ);
    setOnlineAudioLoadWaitMs(0);
    audioLoadingStartedAtRef.current = isAudioQ ? Date.now() : null;
  }, [currentRoom?.activeQuestion?.tileKey, currentRoom?.activeQuestion?.openedAt]);

  // Real-time SFX & answer feedback overlays across both clients
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
      submissionStatus: currentRoom.activeQuestion?.submissionStatus || null,
      lastActionAt: currentRoom.lastActionAt || 0,
      totalScore,
      teamScores,
    };

    const prev = prevRoomSyncRef.current;
    prevRoomSyncRef.current = currentSnapshot;

    if (!prev || prev.code !== currentSnapshot.code) return;

    const wasPlaying = prev.status === 'playing' || prev.status === 'in_game';
    const isNowPlaying =
      currentSnapshot.status === 'playing' || currentSnapshot.status === 'in_game';
    if (!wasPlaying && isNowPlaying) {
      soundFX.playChallengeStart();
    }

    const wasFinished = prev.status === 'finished' || prev.status === 'completed';
    const isNowFinished =
      currentSnapshot.status === 'finished' || currentSnapshot.status === 'completed';
    if (!wasFinished && isNowFinished) {
      soundFX.playMatchWin();
    }

    if (currentSnapshot.openedAt && currentSnapshot.openedAt !== prev.openedAt) {
      soundFX.playTileOpen();
    }

    if (
      prev.submissionStatus !== 'resolved' &&
      currentSnapshot.submissionStatus === 'resolved' &&
      currentRoom.activeQuestion
    ) {
      const aq = currentRoom.activeQuestion;
      if (onlineFeedbackTimerRef.current !== null) {
        window.clearTimeout(onlineFeedbackTimerRef.current);
      }
      if (aq.isCorrect) {
        soundFX.playCorrect();
        setOnlineAnswerFeedback({
          type: 'correct',
          headline: 'إجابة صحيحة!',
          detail: `${aq.submittedByName || ''} +${aq.earnedPoints || aq.points} نقطة`,
          eventKey: `${currentSnapshot.code}_${currentSnapshot.lastActionAt}_correct`,
        });
      } else {
        soundFX.playWrong();
        setOnlineAnswerFeedback({
          type: 'wrong',
          headline: 'إجابة خاطئة',
          detail: `الإجابة الصحيحة: ${aq.correctAnswer}`,
          eventKey: `${currentSnapshot.code}_${currentSnapshot.lastActionAt}_wrong`,
        });
      }
      onlineFeedbackTimerRef.current = window.setTimeout(() => {
        setOnlineAnswerFeedback(null);
        onlineFeedbackTimerRef.current = null;
      }, 2100);
    }
  }, [currentRoom]);

  // Toast notifications
  useEffect(() => {
    if (currentRoom?.lastActionMessage) {
      setToastNotification(currentRoom.lastActionMessage);
      const timer = window.setTimeout(() => setToastNotification(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [currentRoom?.lastActionAt, currentRoom?.lastActionMessage]);

  // Presence heartbeat every 10 seconds
  useEffect(() => {
    if (!currentRoom || !user) return;
    const ping = () => {
      void updateOnlinePlayerPresence(currentRoom.code, myUid, 'online');
    };
    ping();
    const interval = window.setInterval(ping, 10000);
    heartbeatRef.current = interval;
    return () => window.clearInterval(interval);
  }, [currentRoom?.code, myUid, user]);

  // Notify parent app of global presence state
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

  // Record seen questions when question opens
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

  // Question lookup helpers
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

  // Active subcategories filtered cleanly
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

  const playersList = useMemo(
    () => (currentRoom?.players ? Object.values(currentRoom.players) : []),
    [currentRoom?.players]
  );
  const spectatorsList = useMemo(
    () => (currentRoom?.spectators ? Object.values(currentRoom.spectators) : []),
    [currentRoom?.spectators]
  );

  const hostTeam = currentRoom?.teams[0] || {
    id: 'team_1',
    name: currentRoom?.hostName || 'المضيف',
    color: '#14543D',
    score: 0,
  };
  const guestTeam = currentRoom?.teams[1] || {
    id: 'team_2',
    name: currentRoom?.guestName || 'الضيف',
    color: '#F07842',
    score: 0,
  };

  const hostPlayerObj =
    (currentRoom && (currentRoom.players?.[hostUid] || playersList.find((p) => p.teamId === hostTeam.id || p.isHost))) ||
    null;
  const guestPlayerObj =
    (currentRoom &&
      ((guestUid && currentRoom.players?.[guestUid]) ||
        playersList.find((p) => p.teamId === guestTeam.id && !p.isHost))) ||
    null;

  const hostDisplayName = hostPlayerObj?.name || currentRoom?.hostName || hostTeam.name;
  const guestDisplayName = guestPlayerObj?.name || currentRoom?.guestName || 'بانتظار الضيف';

  const isHostOnlineNow = Boolean(
    hostPlayerObj &&
      hostPlayerObj.connectionStatus !== 'offline' &&
      Date.now() - (hostPlayerObj.lastSeen || 0) <= 35000
  );
  const isGuestOnlineNow = Boolean(
    guestPlayerObj &&
      guestPlayerObj.connectionStatus !== 'offline' &&
      Date.now() - (guestPlayerObj.lastSeen || 0) <= 35000
  );

  const hostPicks = currentRoom?.teamSubcategoryIds?.[hostTeam.id] || [];
  const guestPicks = currentRoom?.teamSubcategoryIds?.[guestTeam.id] || [];
  const hasGuest = Boolean(guestUid || guestPlayerObj || playersList.length >= 2);
  const hostConfirmed = Boolean(currentRoom?.categoryConfirmations?.host);
  const guestConfirmed = Boolean(currentRoom?.categoryConfirmations?.guest);
  const isBothCategoriesConfirmed =
    hasGuest && hostPicks.length === 3 && guestPicks.length === 3 && hostConfirmed && guestConfirmed;

  const filteredSubcategories = useMemo(() => {
    return activeSubcategories.filter((sub) => {
      if (categoryFilterMainId !== 'all') {
        const parentMain = mainCategories.find(
          (m) => m.id === categoryFilterMainId || m.name === categoryFilterMainId
        );
        const matchesMain =
          (sub.mainCategoryId && sub.mainCategoryId === categoryFilterMainId) ||
          (parentMain && sub.mainCategory === parentMain.name);
        if (!matchesMain) return false;
      }
      if (categorySearchQuery.trim()) {
        const q = categorySearchQuery.trim().toLowerCase();
        const matchesName = (sub.name || '').toLowerCase().includes(q);
        const matchesMain = (sub.mainCategory || '').toLowerCase().includes(q);
        if (!matchesName && !matchesMain) return false;
      }
      return true;
    });
  }, [activeSubcategories, categoryFilterMainId, categorySearchQuery, mainCategories]);

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
        ) || mainCategories[0];

      const isHostPick = (currentRoom.teamSubcategoryIds?.[hostTeam.id] || []).includes(subId);
      const ownerName = isHostPick ? hostDisplayName : guestDisplayName;
      const ownerColor = isHostPick ? hostTeam.color : guestTeam.color;

      return {
        subId: subObj?.id || subId,
        subName: subObj?.name || 'تصنيف',
        ownerLabel: isHostPick ? `المضيف: ${ownerName}` : `الضيف: ${ownerName}`,
        ownerColor,
        mainCategoryName: parentMain?.name || '',
        accentColor: parentMain?.accentColor || '#14543D',
        bgTint: parentMain?.bgTint || '#EAF2EE',
        borderTint: parentMain?.borderTint || '#14543D',
        iconName: parentMain?.iconName || 'compass',
      };
    });
  }, [currentRoom, subcategories, mainCategories, hostTeam, guestTeam, hostDisplayName, guestDisplayName]);

  const totalPlayableTiles = onlineBoardColumns.length * 5;
  const recentEvents: RoomEventEntry[] = useMemo(() => {
    const list = currentRoom?.eventLog || [];
    return [...list].reverse();
  }, [currentRoom?.eventLog]);

  // Action Handlers
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
      if (name) setPlayerNameInput(name);
    }
    if (!name) {
      setErrorMsg('يرجى إدخال اسمك أولاً لإنشاء الغرفة.');
      return;
    }

    setLoading(true);
    savePlayerName(name);

    try {
      const newRoom = await createOnlineRoom({
        hostName: name,
        user,
        teamCount: 2,
        timerDuration,
        customTeams: [
          { name, color: customTeams[0]?.color || '#14543D' },
          { name: customTeams[1]?.name || 'الضيف', color: customTeams[1]?.color || '#F07842' },
        ],
      });
      setPlayerProfile(getOrCreatePlayerProfile(user, name));
      setCurrentRoom(newRoom);
      connectToRoomStream(newRoom.code);
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل إنشاء الغرفة. يرجى المحاولة مجدداً.');
    } finally {
      setLoading(false);
    }
  };

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
      if (name) setPlayerNameInput(name);
    }
    const code = roomCodeInput.trim().toUpperCase();
    if (!name) {
      setErrorMsg('يرجى إدخال اسمك أولاً.');
      return;
    }
    if (!code || code.length < 5) {
      setErrorMsg('يرجى إدخال رمز غرفة صحيح مكون من 6 خانات.');
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
      setErrorMsg(err?.message || 'تعذر الانضمام إلى الغرفة.');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!currentRoom) return;
    try {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      await leaveOnlineRoom(currentRoom.code, myUid);
    } catch {
      clearActiveOnlineRoomCode();
    } finally {
      setCurrentRoom(null);
      if (onPresenceActivityChange) onPresenceActivityChange('online', null);
    }
  };

  const handleCopyCode = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareInviteLink = () => {
    if (!currentRoom) return;
    const shareUrl = `${window.location.origin}?room=${currentRoom.code}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleToggleCategoryPick = async (subcategoryId: string) => {
    if (!currentRoom || !myRole) return;
    const matchedSub = activeSubcategories.find((s) => s.id === subcategoryId);
    const matchedMain = mainCategories.find(
      (m) => m.id === subcategoryId || m.name === subcategoryId
    );
    if ((matchedSub && isSubComingSoon(matchedSub)) || matchedMain?.isComingSoon) {
      triggerComingSoonAlert();
      return;
    }

    setErrorMsg(null);
    setIsTogglingSubId(subcategoryId);
    try {
      const updated = await toggleOnlineSubcategoryPick(currentRoom.code, subcategoryId);
      setCurrentRoom(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء تعديل اختيار الفئة.');
    } finally {
      setIsTogglingSubId(null);
    }
  };

  const handleConfirmMyCategories = async (confirmed: boolean) => {
    if (!currentRoom || !myRole || isConfirmingBusy) return;
    setErrorMsg(null);
    setIsConfirmingBusy(true);
    try {
      const updated = await confirmOnlineCategories(currentRoom.code, confirmed);
      setCurrentRoom(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تحديث تأكيد الفئات.');
    } finally {
      setIsConfirmingBusy(false);
    }
  };

  const handleHostStartGameClick = async () => {
    if (!currentRoom || !isHost || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const updated = await hostStartGame(currentRoom.code);
      setCurrentRoom(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر بدء المباراة.');
    } finally {
      setLoading(false);
    }
  };

  const handleTurnTileClick = async (
    subId: string,
    subName: string,
    points: PointValue,
    tileKey: string
  ) => {
    if (!currentRoom || !isMyTurn || currentRoom.activeQuestion) return;
    if ((currentRoom.usedTileKeys || []).includes(tileKey)) return;

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
      return;
    }

    setErrorMsg(null);
    try {
      const updated = await selectOnlineQuestion({
        code: currentRoom.code,
        tileKey,
        questionId: matchedQ.id,
        subcategoryName: subName,
      });
      setCurrentRoom(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر فتح السؤال.');
    }
  };

  const handleSubmitPlayerAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom || !isMyTurn || !currentRoom.activeQuestion || isSubmittingAnswer) {
      return;
    }
    const trimmed = answerDraft.trim();
    if (!trimmed) {
      setErrorMsg('يرجى كتابة إجابتك أولاً.');
      return;
    }

    setErrorMsg(null);
    setIsSubmittingAnswer(true);
    try {
      const updated = await submitOnlineAnswer({
        code: currentRoom.code,
        answer: trimmed,
      });
      setCurrentRoom(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر إرسال الإجابة.');
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleSkipCurrentQuestion = async () => {
    if (!currentRoom || !isMyTurn || !currentRoom.activeQuestion || isSubmittingAnswer) {
      return;
    }
    setErrorMsg(null);
    setIsSubmittingAnswer(true);
    try {
      const updated = await timeoutOrSkipOnlineQuestion(currentRoom.code);
      setCurrentRoom(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تخطي السؤال.');
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleDismissResult = async () => {
    if (!currentRoom || !myRole || !currentRoom.activeQuestion || isDismissingResult) {
      return;
    }
    setIsDismissingResult(true);
    try {
      const updated = await dismissResolvedOnlineQuestion(currentRoom.code);
      setCurrentRoom(updated);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر إغلاق النتيجة.');
    } finally {
      setIsDismissingResult(false);
    }
  };

  // Mandatory Login Gate
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
            لإنشاء غرفة أو الانضمام لمنافسة مباشرة مع خصمك من جهازين مختلفين، يرجى تسجيل الدخول إلى حسابك.
          </p>
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
  // 1. ENTRY SCREEN (Create or Join Host-vs-Guest Duel Room)
  // -------------------------------------------------------------
  if (!currentRoom) {
    return (
      <div className="max-w-[1000px] mx-auto px-3 sm:px-4 py-5 md:py-12 space-y-6 md:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4 sm:pb-5">
          <div className="space-y-1.5">
            <StatusBadge tone="green">
              <Radio className="w-3.5 h-3.5 text-[#F07842]" />
              <span>منافسة ثنائية مباشرة • المضيف ضد الضيف</span>
            </StatusBadge>
            <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-[#1B1F1C]">
              تحدّوا بعض أونلاين بالدور من أجهزتكم!
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

        {isReconnecting && (
          <AlertBanner tone="info">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="w-4 h-4 border-2 border-[#14543D] border-t-transparent rounded-full animate-spin" />
              <span>جاري استعادة جلستك النشطة في الغرفة...</span>
            </div>
          </AlertBanner>
        )}

        {!isOnline && (
          <AlertBanner tone="warning">
            يتطلب اللعب عن بُعد اتصالاً بالإنترنت للمزامنة المباشرة بين اللاعبين.
          </AlertBanner>
        )}

        {errorMsg && (
          <AlertBanner tone="error" onDismiss={() => setErrorMsg(null)}>
            {errorMsg}
          </AlertBanner>
        )}

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
                إنشاء غرفة نِزال (المضيف ضد الضيف)
              </h2>
              <p className="text-xs text-[#52574E]">
                يختار المضيف 3 فئات والضيف 3 فئات، وتتناوبان الأدوار مع التحقق التلقائي من الإجابات.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                اسمك (المضيف):
              </label>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="مثال: سعود، نورة، أبو فهد..."
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 outline-none text-sm font-bold text-[#1B1F1C]"
                required
              />
            </div>

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
              className="w-full min-h-[50px] py-3.5 text-base font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جاري إنشاء الغرفة...</span>
                </div>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-[#F07842]" />
                  <span>إنشاء الغرفة والحصول على الرمز</span>
                </>
              )}
            </button>
          </form>
        )}

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
                className="w-full px-4 py-3.5 rounded-xl bg-[#F7F8F1] border-2 border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#F07842] outline-none text-center font-mono text-2xl font-bold tracking-widest text-[#14543D] uppercase"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                اسمك المعروض:
              </label>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="اكتب اسمك للمباراة..."
                className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#F07842] outline-none text-sm font-bold text-[#1B1F1C]"
                required
              />
            </div>

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
                  <span>دخول كضيف (منافس)</span>
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
              className="w-full min-h-[50px] py-3.5 text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
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
                    {joinRole === 'spectator' ? 'دخول للمشاهدة' : 'دخول كمنافس'}
                  </span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    );
  }

  // Keep local active room saved whenever viewing an active room
  if (currentRoom.code && currentRoom.status !== 'finished') {
    saveActiveOnlineRoomCode(currentRoom.code, isSpectator ? 'spectator' : 'player', myUid);
  }

  // -------------------------------------------------------------
  // 2. LOBBY & CATEGORY SELECTION SCREEN
  // -------------------------------------------------------------
  const isLobbyOrSelecting =
    currentRoom.status === 'waiting_for_opponent' ||
    currentRoom.status === 'selecting_categories' ||
    currentRoom.status === 'ready' ||
    currentRoom.status === 'lobby' ||
    (currentRoom.status as string) === 'waiting';

  if (isLobbyOrSelecting) {
    const myPicks = myRole === 'host' ? hostPicks : myRole === 'guest' ? guestPicks : [];
    const amIConfirmed = myRole === 'host' ? hostConfirmed : myRole === 'guest' ? guestConfirmed : false;

    const getSubcategoryById = (id: string) =>
      subcategories.find((s) => s.id === id) ||
      subcategories.find((s) => s.name === id) ||
      DEFAULT_SUBCATEGORIES.find((s) => s.id === id) || {
        id,
        name: id,
        mainCategory: 'عام',
        iconName: 'help-circle',
      };

    return (
      <div className="max-w-[1150px] mx-auto px-3 sm:px-4 py-5 md:py-8 space-y-5 sm:space-y-7">
        {!isOnline && (
          <AlertBanner tone="warning">
            انقطع الاتصال بالإنترنت — ستعود المزامنة تلقائياً فور عودة الاتصال.
          </AlertBanner>
        )}

        {errorMsg && (
          <AlertBanner tone="error" onDismiss={() => setErrorMsg(null)}>
            {errorMsg}
          </AlertBanner>
        )}

        {toastNotification && (
          <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md bg-[#14543D] text-[#FFFFFF] px-4 py-2.5 rounded-2xl shadow-lg border border-white/20 text-xs font-bold flex items-center justify-center gap-2 text-center">
            <BellRing className="w-4 h-4 text-[#F07842] shrink-0" />
            <span>{toastNotification}</span>
          </div>
        )}

        {isSpectator && (
          <div className="p-4 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/25 text-[#14543D] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Eye className="w-5 h-5 text-[#F07842] shrink-0" />
              <span>أنت تشاهد هذه الغرفة بوضع المشاهد (للعرض فقط — لا يمكنك تعديل الفئات).</span>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#14543D]/15 tabular-nums">
              المشاهدون: {spectatorsList.length}
            </span>
          </div>
        )}

        {!isHostOnlineNow && isGuest && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>المضيف ({hostDisplayName}) غير متصل حالياً. يمكنك استلام إدارة الغرفة لبدء التحدي.</span>
            </div>
            <button
              type="button"
              onClick={() => void claimOnlineHost(currentRoom.code).then(setCurrentRoom).catch((e) => setErrorMsg(e?.message))}
              className="min-h-[44px] px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
            >
              استلام دور المضيف 👑
            </button>
          </div>
        )}

        {/* Room Header Card */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-6 md:p-8 space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#52574E] flex-wrap">
                <Radio className="w-3.5 h-3.5 text-[#14543D]" />
                <span>منافسة ثنائية مباشرة</span>
                <span>•</span>
                <span className="font-bold text-[#14543D]">المضيف: {hostDisplayName}</span>
                <span>•</span>
                {isSpectator ? (
                  <span className="font-bold text-[#F07842]">مشاهد (للعرض فقط)</span>
                ) : (
                  <span className="font-bold text-[#1B1F1C]">
                    دورك: {isHost ? 'المضيف 👑' : 'الضيف ⚔️'}
                  </span>
                )}
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-[#1B1F1C] mt-1">
                صالة اختيار الفئات (6 فئات للمباراة)
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {!isSpectator && (
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(true)}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4 text-[#F07842]" />
                  <span>دعوة أصدقاء</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="min-h-[44px] px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>{isSpectator ? 'مغادرة المشاهدة' : 'مغادرة الغرفة'}</span>
              </button>
            </div>
          </div>

          <div className="bg-[#F7F8F1] border border-[#14543D]/20 rounded-2xl p-4 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-right">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#52574E]">
                رمز الغرفة (شاركه مع الضيف للانضمام):
              </div>
              <div className="font-mono text-3xl sm:text-4xl font-bold tracking-widest text-[#14543D]">
                {currentRoom.code}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center justify-center gap-2.5 w-full md:w-auto">
              <button
                type="button"
                onClick={handleCopyCode}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FFFFFF] hover:bg-[#EAF2EE] border border-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'تم نسخ الرمز!' : 'نسخ الرمز'}</span>
              </button>
              <button
                type="button"
                onClick={handleShareInviteLink}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-xs font-bold text-[#FFFFFF] flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span>{copiedLink ? 'تم نسخ الرابط!' : 'مشاركة رابط الدعوة'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Host vs Guest Category Slots (3 + 3 = 6) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* HOST CARD */}
          <div
            className={`bg-[#FFFFFF] border-2 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs ${
              isHost ? 'ring-2 ring-[#14543D]/20' : ''
            }`}
            style={{ borderColor: `${hostTeam.color}65` }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#E5E8DD] pb-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isHostOnlineNow ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                />
                <span className="font-display font-bold text-base text-[#1B1F1C] truncate">
                  {hostDisplayName}
                </span>
                <StatusBadge tone="green">المضيف 👑</StatusBadge>
                {isHost && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#14543D] text-white">
                    أنت
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold font-mono tabular-nums px-2.5 py-1 rounded-lg bg-[#F7F8F1] border border-[#E5E8DD] text-[#14543D]">
                  {hostPicks.length} / 3
                </span>
                {hostConfirmed && (
                  <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/25 inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    مؤكد
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2">
              {[0, 1, 2].map((slotIdx) => {
                const subId = hostPicks[slotIdx];
                if (subId) {
                  const subObj = getSubcategoryById(subId);
                  return (
                    <div
                      key={slotIdx}
                      className="p-2.5 rounded-xl border border-[#14543D]/30 bg-[#EAF2EE] flex flex-col justify-between min-h-[80px] relative"
                    >
                      <div className="text-[10px] font-bold text-[#14543D]/80 line-clamp-1 pl-7">
                        {subObj.mainCategory || 'فئة'}
                      </div>
                      <div className="font-display text-xs sm:text-sm font-bold text-[#14543D] leading-snug line-clamp-2 text-center my-auto">
                        {subObj.name}
                      </div>
                      {isHost && !hostConfirmed && (
                        <button
                          type="button"
                          onClick={() => void handleToggleCategoryPick(subId)}
                          aria-label={`إلغاء اختيار ${subObj.name}`}
                          className="absolute top-1 left-1 min-w-[28px] min-h-[28px] rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center cursor-pointer"
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
                    className="p-2.5 rounded-xl border border-dashed border-[#E5E8DD] bg-[#F7F8F1] flex flex-col items-center justify-center text-center min-h-[80px] text-[#666B62]"
                  >
                    <span className="text-xs font-bold">فئة {slotIdx + 1}</span>
                    <span className="text-[10px]">فارغة</span>
                  </div>
                );
              })}
            </div>

            {isHost && (
              <div className="pt-1">
                {hostConfirmed ? (
                  <button
                    type="button"
                    disabled={isConfirmingBusy}
                    onClick={() => void handleConfirmMyCategories(false)}
                    className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] hover:bg-[#EAF2EE] text-xs font-bold text-[#1B1F1C] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل اختياراتي</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={hostPicks.length !== 3 || isConfirmingBusy}
                    onClick={() => void handleConfirmMyCategories(true)}
                    className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] disabled:bg-[#F3F5E9] disabled:text-[#666B62] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد اختياراتي ({hostPicks.length}/3)</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* GUEST CARD */}
          <div
            className={`bg-[#FFFFFF] border-2 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs ${
              isGuest ? 'ring-2 ring-[#F07842]/20' : ''
            }`}
            style={{ borderColor: `${guestTeam.color}65` }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#E5E8DD] pb-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    hasGuest
                      ? isGuestOnlineNow
                        ? 'bg-emerald-500'
                        : 'bg-amber-400'
                      : 'bg-gray-300'
                  }`}
                />
                <span className="font-display font-bold text-base text-[#1B1F1C] truncate">
                  {hasGuest ? guestDisplayName : 'بانتظار انضمام الضيف...'}
                </span>
                <StatusBadge tone="orange">الضيف ⚔️</StatusBadge>
                {isGuest && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#F07842] text-white">
                    أنت
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold font-mono tabular-nums px-2.5 py-1 rounded-lg bg-[#F7F8F1] border border-[#E5E8DD] text-[#D9632E]">
                  {guestPicks.length} / 3
                </span>
                {guestConfirmed && (
                  <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#FEF2EC] text-[#D9632E] border border-[#F07842]/25 inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    مؤكد
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2">
              {[0, 1, 2].map((slotIdx) => {
                const subId = guestPicks[slotIdx];
                if (subId) {
                  const subObj = getSubcategoryById(subId);
                  return (
                    <div
                      key={slotIdx}
                      className="p-2.5 rounded-xl border border-[#F07842]/30 bg-[#FEF2EC] flex flex-col justify-between min-h-[80px] relative"
                    >
                      <div className="text-[10px] font-bold text-[#D9632E] line-clamp-1 pl-7">
                        {subObj.mainCategory || 'فئة'}
                      </div>
                      <div className="font-display text-xs sm:text-sm font-bold text-[#1B1F1C] leading-snug line-clamp-2 text-center my-auto">
                        {subObj.name}
                      </div>
                      {isGuest && !guestConfirmed && (
                        <button
                          type="button"
                          onClick={() => void handleToggleCategoryPick(subId)}
                          aria-label={`إلغاء اختيار ${subObj.name}`}
                          className="absolute top-1 left-1 min-w-[28px] min-h-[28px] rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center cursor-pointer"
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
                    className="p-2.5 rounded-xl border border-dashed border-[#E5E8DD] bg-[#F7F8F1] flex flex-col items-center justify-center text-center min-h-[80px] text-[#666B62]"
                  >
                    <span className="text-xs font-bold">فئة {slotIdx + 1}</span>
                    <span className="text-[10px]">فارغة</span>
                  </div>
                );
              })}
            </div>

            {isGuest && (
              <div className="pt-1">
                {guestConfirmed ? (
                  <button
                    type="button"
                    disabled={isConfirmingBusy}
                    onClick={() => void handleConfirmMyCategories(false)}
                    className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] hover:bg-[#FEF2EC] text-xs font-bold text-[#1B1F1C] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل اختياراتي</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={guestPicks.length !== 3 || isConfirmingBusy}
                    onClick={() => void handleConfirmMyCategories(true)}
                    className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] disabled:bg-[#F3F5E9] disabled:text-[#666B62] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد اختياراتي ({guestPicks.length}/3)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Interactive Category Browser */}
        {!isSpectator && myRole && (
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-6 md:p-8 space-y-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
              <div className="space-y-1">
                <StatusBadge tone={isHost ? 'green' : 'orange'}>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {amIConfirmed
                      ? 'تم تأكيد اختياراتك الثلاث'
                      : `اختر 3 فئات (${myPicks.length}/3)`}
                  </span>
                </StatusBadge>
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C]">
                  قائمة الفئات المتاحة
                </h2>
                <p className="text-xs text-[#52574E]">
                  تظهر اختياراتك واختيارات خصمك مباشرة للطرفين. لا يمكن تكرار نفس الفئة بين اللاعبين.
                </p>
              </div>
            </div>

            {amIConfirmed && (
              <AlertBanner tone="info">
                أكّدت فئاتك الثلاث بنجاح. لتبديل أي فئة قبل بدء المباراة، اضغط على «تعديل اختياراتي» في بطاقتك أعلاه.
              </AlertBanner>
            )}

            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[#666B62] pointer-events-none" />
                <input
                  type="text"
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  placeholder="ابحث عن فئة معينة..."
                  className="w-full min-h-[44px] pr-10 pl-10 py-2.5 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#F07842] text-xs font-bold text-[#1B1F1C] outline-none"
                />
                {categorySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCategorySearchQuery('')}
                    aria-label="مسح البحث"
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-lg hover:bg-[#E5E8DD]/60 text-xs text-[#52574E] flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setCategoryFilterMainId('all')}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                    categoryFilterMainId === 'all'
                      ? 'bg-[#14543D] text-white'
                      : 'bg-[#F7F8F1] border border-[#E5E8DD] text-[#1B1F1C]'
                  }`}
                >
                  الكل ({activeSubcategories.length})
                </button>
                {mainCategories
                  .filter((m) => m.isActive && !m.isDeleted)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setCategoryFilterMainId(m.id);
                        if (m.isComingSoon) triggerComingSoonAlert();
                      }}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1.5 ${
                        categoryFilterMainId === m.id
                          ? 'bg-[#14543D] text-white'
                          : 'bg-[#F7F8F1] border border-[#E5E8DD] text-[#1B1F1C]'
                      }`}
                    >
                      <span>{m.name}</span>
                      {m.isComingSoon && (
                        <span className="px-1.5 py-0.5 rounded bg-[#F07842]/20 text-[#D9632E] text-[10px]">
                          قريباً
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            <div className="grid grid-cols-1 min-[375px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[380px] overflow-y-auto p-1">
              {filteredSubcategories.map((sub) => {
                const comingSoon = isSubComingSoon(sub);
                const pickedByHost = hostPicks.includes(sub.id);
                const pickedByGuest = guestPicks.includes(sub.id);
                const pickedByMe = myPicks.includes(sub.id);
                const pickedByOpponent = myRole === 'host' ? pickedByGuest : pickedByHost;
                const isToggling = isTogglingSubId === sub.id;

                if (comingSoon) {
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => triggerComingSoonAlert()}
                      className="p-3.5 rounded-2xl border-2 border-dashed border-[#D4D9CC] bg-[#F7F8F1] text-center cursor-not-allowed flex flex-col justify-between min-h-[112px] opacity-80"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-[#52574E] truncate">{sub.mainCategory}</span>
                        <span className="px-2 py-0.5 rounded bg-[#F07842] text-white text-[10px]">قريباً</span>
                      </div>
                      <div className="font-display text-sm font-bold text-[#1B1F1C]">{sub.name}</div>
                      <div className="text-[11px] font-bold text-[#D9632E]">غير متاحة</div>
                    </button>
                  );
                }

                return (
                  <button
                    key={sub.id}
                    type="button"
                    disabled={isToggling || amIConfirmed || pickedByOpponent}
                    onClick={() => void handleToggleCategoryPick(sub.id)}
                    className={`p-3.5 rounded-2xl border-2 text-center transition-colors flex flex-col justify-between min-h-[112px] ${
                      pickedByMe
                        ? 'bg-[#EAF2EE] border-[#14543D] ring-2 ring-[#14543D]/15 cursor-pointer'
                        : pickedByOpponent
                        ? 'bg-[#FEF2EC]/70 border-[#F07842]/35 opacity-80 cursor-not-allowed'
                        : amIConfirmed
                        ? 'bg-[#F7F8F1] border-[#E5E8DD] opacity-65 cursor-not-allowed'
                        : 'bg-[#FFFFFF] border-[#E5E8DD] hover:border-[#14543D]/50 hover:bg-[#F7F8F1] cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="text-[#14543D] font-bold truncate">{sub.mainCategory}</span>
                      {isToggling && (
                        <span className="w-3.5 h-3.5 border-2 border-[#14543D] border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    <div className="font-display text-sm font-bold text-[#1B1F1C] leading-snug line-clamp-2 my-auto py-1">
                      {sub.name}
                    </div>
                    <div className="pt-1 flex items-center justify-center gap-1">
                      {pickedByMe ? (
                        <span className="text-[11px] text-[#14543D] font-bold inline-flex items-center gap-0.5">
                          <Check className="w-3.5 h-3.5" /> اختيارك
                        </span>
                      ) : pickedByOpponent ? (
                        <span className="text-[11px] text-[#D9632E] font-bold inline-flex items-center gap-0.5">
                          <Lock className="w-3 h-3" /> اختارها الخصم
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-[#52574E]">
                          {myPicks.length >= 3 ? 'اكتملت فئاتك' : '+ اختيار'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredComingSoonMainCards.map((mainCat) => (
                <button
                  key={mainCat.id}
                  type="button"
                  onClick={() => triggerComingSoonAlert()}
                  className="p-3 rounded-2xl border-2 border-dashed border-[#D4D9CC] bg-[#F7F8F1] text-right cursor-not-allowed flex flex-col justify-between min-h-[112px] opacity-85"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-display text-xs font-bold text-[#1B1F1C] truncate">
                      {mainCat.name}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#F07842] text-white text-[10px] font-bold">
                      قريباً
                    </span>
                  </div>
                  <div className="text-[10px] font-bold text-[#D9632E]">غير متاحة حالياً</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Match Start Checklist */}
        <div className="bg-[#FFFFFF] border-2 border-[#14543D]/25 rounded-3xl p-4 sm:p-6 md:p-8 space-y-4 shadow-xs">
          <h3 className="font-display text-base font-bold text-[#1B1F1C]">
            شروط انطلاق المنافسة:
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
            <div className="p-2.5 rounded-xl bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/25 flex items-center gap-1.5">
              <Check className="w-4 h-4 shrink-0" />
              <span>1. المضيف جاهز</span>
            </div>
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-1.5 ${
                hasGuest
                  ? 'bg-[#EAF2EE] text-[#14543D] border-[#14543D]/25'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {hasGuest ? <Check className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
              <span>{hasGuest ? '2. الضيف انضم' : '2. بانتظار الضيف'}</span>
            </div>
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-1.5 ${
                hostPicks.length === 3 && hostConfirmed
                  ? 'bg-[#EAF2EE] text-[#14543D] border-[#14543D]/25'
                  : 'bg-[#F7F8F1] text-[#52574E] border-[#E5E8DD]'
              }`}
            >
              {hostPicks.length === 3 && hostConfirmed ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <Layers className="w-4 h-4 shrink-0" />
              )}
              <span>3. تأكيد المضيف ({hostPicks.length}/3)</span>
            </div>
            <div
              className={`p-2.5 rounded-xl border flex items-center gap-1.5 ${
                guestPicks.length === 3 && guestConfirmed
                  ? 'bg-[#EAF2EE] text-[#14543D] border-[#14543D]/25'
                  : 'bg-[#F7F8F1] text-[#52574E] border-[#E5E8DD]'
              }`}
            >
              {guestPicks.length === 3 && guestConfirmed ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <Layers className="w-4 h-4 shrink-0" />
              )}
              <span>4. تأكيد الضيف ({guestPicks.length}/3)</span>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-[#E5E8DD]">
            <div className="text-xs text-[#52574E]">
              {!hasGuest
                ? 'بانتظار دخول الضيف برمز الغرفة أعلاه.'
                : !isBothCategoriesConfirmed
                ? 'يجب اختيار وتأكيد 3 فئات من كل لاعب قبل بدء المباراة.'
                : 'تم تأكيد الفئات الست! المضيف يبدأ الدور الأول مباشرة.'}
            </div>

            {isHost ? (
              <button
                type="button"
                disabled={!isBothCategoriesConfirmed || loading}
                onClick={() => void handleHostStartGameClick()}
                className={`w-full sm:w-auto min-h-[48px] px-7 py-3 text-sm sm:text-base font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shrink-0 ${
                  isBothCategoriesConfirmed && !loading
                    ? 'bg-[#14543D] text-white hover:bg-[#0E3F2D] cursor-pointer shadow-sm'
                    : 'bg-[#F3F5E9] text-[#666B62] border border-[#E5E8DD] cursor-not-allowed'
                }`}
              >
                {loading ? (
                  <span>جاري البدء...</span>
                ) : (
                  <>
                    <Flame className="w-5 h-5 text-[#F07842]" />
                    <span>بدء المباراة الآن</span>
                  </>
                )}
              </button>
            ) : (
              <div className="text-xs font-bold text-[#14543D] bg-[#EAF2EE] px-4 py-3 rounded-xl border border-[#14543D]/20 text-center">
                {isBothCategoriesConfirmed
                  ? 'تم تأكيد الاختيارات — بانتظار المضيف لبدء المباراة 🚀'
                  : isSpectator
                  ? 'تشاهد التجهيز الآن بوضع المشاهد'
                  : 'أكمل اختيار وتأكيد فئاتك الثلاث أعلاه'}
              </div>
            )}
          </div>
        </div>

        <InviteFriendsModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          user={user}
          roomCode={currentRoom.code}
          canInviteToPlay={!hasGuest}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 3. LIVE TURN-BASED DUEL BOARD
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
    const currentTurnPlayerName =
      activeTurnRole === 'host' ? hostDisplayName : guestDisplayName;
    const currentTurnColor =
      activeTurnRole === 'host' ? hostTeam.color : guestTeam.color;

    return (
      <MotionConfig reducedMotion="user">
        <div className="max-w-[1380px] mx-auto px-3 sm:px-6 py-4 md:py-7 space-y-4 sm:space-y-6">
          {!isOnline && (
            <AlertBanner tone="warning">
              انقطع الاتصال بالإنترنت — ستعود المزامنة تلقائياً فور استعادة الاتصال.
            </AlertBanner>
          )}

          {errorMsg && (
            <AlertBanner tone="error" onDismiss={() => setErrorMsg(null)}>
              {errorMsg}
            </AlertBanner>
          )}

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

          {toastNotification && !onlineAnswerFeedback && (
            <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md bg-[#1B1F1C] text-[#FFFFFF] px-4 py-2.5 rounded-2xl shadow-lg border border-white/15 text-xs font-bold flex items-center justify-center gap-2 text-center">
              <BellRing className="w-4 h-4 text-[#F07842] shrink-0" />
              <span>{toastNotification}</span>
            </div>
          )}

          {/* Top Bar & Scoreboard */}
          <section className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-3.5 sm:p-5 lg:p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F7F8F1] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C]">
                  <span className="w-2 h-2 rounded-full bg-[#F07842]" />
                  <span>غرفة:</span>
                  <span className="font-mono">{currentRoom.code}</span>
                </span>
                <span className="text-xs font-bold text-[#14543D] bg-[#EAF2EE] px-2.5 py-1 rounded-lg">
                  {isHost
                    ? 'أنت المضيف 👑'
                    : isGuest
                    ? 'أنت الضيف ⚔️'
                    : 'مشاهد (للعرض فقط)'}
                </span>
                <span className="text-xs text-[#52574E] font-mono tabular-nums bg-[#F7F8F1] border border-[#E5E8DD] px-2.5 py-1 rounded-lg">
                  المتبقي: {remainingOnlineTiles} / {totalPlayableTiles}
                </span>
                {spectatorsList.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#14543D] tabular-nums bg-[#EAF2EE] px-2.5 py-1 rounded-lg">
                    <Eye className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>{spectatorsList.length}</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isSpectator && (
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(true)}
                    className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-xl bg-[#14543D] text-white hover:bg-[#0E3D2C] cursor-pointer flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>دعوة للمشاهدة</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => soundFX.toggle()}
                  className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 border bg-[#F7F8F1] border-[#E5E8DD] text-[#1B1F1C]"
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>{soundEnabled ? 'الأصوات' : 'مكتوم'}</span>
                </button>

                {isHost && (
                  <button
                    type="button"
                    onClick={() => void hostFinishGame(currentRoom.code).catch((e) => setErrorMsg(e?.message))}
                    className="min-h-[44px] sm:min-h-[40px] px-3.5 py-1.5 text-xs font-bold text-white bg-[#1B1F1C] hover:bg-[#2F3530] rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <Trophy className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>إنهاء المباراة</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl cursor-pointer flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </div>
            </div>

            {/* Host vs Guest Score Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* HOST SCORE CARD */}
              <div
                className={`relative overflow-hidden p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 ${
                  activeTurnRole === 'host'
                    ? 'bg-[#FFFDF9] shadow-md'
                    : 'bg-[#F7F8F1]/80 border-[#E5E8DD] opacity-90'
                }`}
                style={{ borderColor: activeTurnRole === 'host' ? hostTeam.color : '#E5E8DD' }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1.5"
                  style={{ backgroundColor: activeTurnRole === 'host' ? hostTeam.color : 'transparent' }}
                />
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        isHostOnlineNow ? 'bg-emerald-500' : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-display text-sm sm:text-base font-bold text-[#1B1F1C] truncate">
                      {hostDisplayName}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#EAF2EE] text-[#14543D]">
                      المضيف
                    </span>
                    {isHost && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#14543D] text-white">
                        أنت
                      </span>
                    )}
                  </div>
                  {activeTurnRole === 'host' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#14543D] bg-[#EAF2EE] px-2.5 py-0.5 rounded-md">
                      <Sparkles className="w-3 h-3 text-[#F07842]" />
                      <span>الدور الحالي</span>
                    </span>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <AnimatedScoreCounter
                    value={hostTeam.score}
                    animateOnMount={false}
                    motionEnabled={effects.motion && effects.correct}
                    showDeltaBadge={effects.correct}
                    className="font-mono tabular-nums text-3xl font-extrabold leading-none"
                    style={{ color: hostTeam.color }}
                  />
                  <div className="text-[10px] font-medium text-[#52574E] mt-1">نقطة</div>
                </div>
              </div>

              {/* GUEST SCORE CARD */}
              <div
                className={`relative overflow-hidden p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 ${
                  activeTurnRole === 'guest'
                    ? 'bg-[#FFFDF9] shadow-md'
                    : 'bg-[#F7F8F1]/80 border-[#E5E8DD] opacity-90'
                }`}
                style={{ borderColor: activeTurnRole === 'guest' ? guestTeam.color : '#E5E8DD' }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1.5"
                  style={{ backgroundColor: activeTurnRole === 'guest' ? guestTeam.color : 'transparent' }}
                />
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        isGuestOnlineNow ? 'bg-emerald-500' : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-display text-sm sm:text-base font-bold text-[#1B1F1C] truncate">
                      {guestDisplayName}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FEF2EC] text-[#D9632E]">
                      الضيف
                    </span>
                    {isGuest && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F07842] text-white">
                        أنت
                      </span>
                    )}
                  </div>
                  {activeTurnRole === 'guest' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D9632E] bg-[#FEF2EC] px-2.5 py-0.5 rounded-md">
                      <Sparkles className="w-3 h-3 text-[#F07842]" />
                      <span>الدور الحالي</span>
                    </span>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <AnimatedScoreCounter
                    value={guestTeam.score}
                    animateOnMount={false}
                    motionEnabled={effects.motion && effects.correct}
                    showDeltaBadge={effects.correct}
                    className="font-mono tabular-nums text-3xl font-extrabold leading-none"
                    style={{ color: guestTeam.color }}
                  />
                  <div className="text-[10px] font-medium text-[#52574E] mt-1">نقطة</div>
                </div>
              </div>
            </div>

            {/* Smooth Animated Turn Indicator */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`turn-${currentRoom.turnNumber || 1}-${activeTurnRole}`}
                initial={effects.motion ? { opacity: 0, y: -6 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={effects.motion ? { opacity: 0, y: 6 } : undefined}
                transition={{ duration: 0.22 }}
                className="rounded-2xl p-3 sm:p-4 border flex flex-col sm:flex-row items-center justify-between gap-2"
                style={{
                  backgroundColor: isMyTurn ? '#EAF2EE' : '#F7F8F1',
                  borderColor: isMyTurn ? '#14543D' : '#E5E8DD',
                }}
              >
                <div className="flex items-center gap-2.5 text-center sm:text-right">
                  <span
                    className="w-8 h-8 rounded-xl text-white flex items-center justify-center shrink-0 shadow-2xs"
                    style={{ backgroundColor: currentTurnColor }}
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="font-display text-sm sm:text-base font-bold text-[#1B1F1C]">
                      {isMyTurn
                        ? 'دورك الآن! اختر سؤالاً من اللوحة'
                        : `الدور الآن: ${currentTurnPlayerName} (${activeTurnRole === 'host' ? 'المضيف' : 'الضيف'})`}
                    </div>
                    <div className="text-[11px] text-[#52574E]">
                      {isMyTurn
                        ? 'اضغط على قيمة النقاط المناسبة ليظهر السؤال لك ولخصمك ثم أرسل إجابتك.'
                        : 'لوحة الأسئلة للعرض فقط حتى يختار خصمك ويجيب على سؤاله.'}
                    </div>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs font-bold px-3 py-1 rounded-lg bg-white border border-[#E5E8DD] text-[#1B1F1C] shrink-0">
                  الدور #{currentRoom.turnNumber || 1}
                </span>
              </motion.div>
            </AnimatePresence>

            {/* Last Resolved Turn Summary Strip */}
            {currentRoom.lastResolvedTurn && (
              <div
                className={`rounded-2xl p-3 sm:p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs ${
                  currentRoom.lastResolvedTurn.isCorrect
                    ? 'bg-[#EAF2EE]/65 border-[#14543D]/25'
                    : 'bg-[#FEF2EC]/65 border-[#F07842]/25'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-[#1B1F1C] flex items-center gap-1.5 flex-wrap">
                    <span>آخر جولة:</span>
                    <span>{currentRoom.lastResolvedTurn.actorName}</span>
                    <span>•</span>
                    <span>
                      {currentRoom.lastResolvedTurn.subcategoryName} (
                      {currentRoom.lastResolvedTurn.points} نقطة)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        currentRoom.lastResolvedTurn.isCorrect
                          ? 'bg-[#14543D] text-white'
                          : 'bg-[#F07842] text-white'
                      }`}
                    >
                      {currentRoom.lastResolvedTurn.isCorrect
                        ? `صحيحة (+${currentRoom.lastResolvedTurn.earnedPoints})`
                        : 'خاطئة (0)'}
                    </span>
                  </div>
                  <div className="text-[#52574E]">
                    الإجابة المرسلة: «{currentRoom.lastResolvedTurn.submittedAnswer}» — الإجابة المعتمدة:{' '}
                    <strong className="text-[#1B1F1C]">
                      {currentRoom.lastResolvedTurn.correctAnswer}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 6-Category × 5-Tier Board */}
          <section
            aria-label="لوحة الأسئلة المباشرة"
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-3 sm:p-5 lg:p-6 shadow-xs space-y-4"
          >
            {/* Mobile / Tablet 2-3 Columns */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 lg:hidden">
              {onlineBoardColumns.map((col, cIdx) => {
                const isWkCol = isWalaKalimaCategory({
                  subcategoryId: col.subId,
                  subcategoryName: col.subName,
                  mainCategoryName: col.mainCategoryName,
                });
                return (
                  <div key={`mob_${cIdx}`} className="flex flex-col gap-2 min-w-0">
                    <div
                      className="relative overflow-hidden rounded-2xl p-2.5 border text-center flex flex-col items-center justify-between gap-1.5 min-h-[100px]"
                      style={{ backgroundColor: col.bgTint, borderColor: col.borderTint }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ backgroundColor: isWkCol ? '#F07842' : col.accentColor }}
                      />
                      <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#14543D] max-w-full pt-0.5">
                        <CategoryIcon iconName={col.iconName} color={col.accentColor} className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{col.mainCategoryName}</span>
                      </div>
                      <div className="font-display font-bold text-sm text-[#1B1F1C] line-clamp-2 leading-snug">
                        {col.subName}
                      </div>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFFFFF]/90 border border-[#E5E8DD] text-[10px] font-bold text-[#1B1F1C] max-w-full">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: col.ownerColor }} />
                        <span className="truncate">{col.ownerLabel}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {POINT_TIERS.map((points) => {
                        const tileKey = `${col.subId}__${points}`;
                        const isUsed = (currentRoom.usedTileKeys || []).includes(tileKey);
                        const isActiveSelected = currentRoom.activeQuestion?.tileKey === tileKey;
                        const slot = !isUsed && !isWkCol && isMyTurn ? findSlotForTile(col.subId, col.subName, points, tileKey) : null;
                        const isExhausted = Boolean(!isWkCol && slot && !slot.question && slot.isExhausted);
                        const canClick = isMyTurn && !isUsed && !currentRoom.activeQuestion && !isExhausted;

                        return (
                          <button
                            key={`mob_${col.subId}_${points}`}
                            type="button"
                            disabled={!canClick}
                            onClick={() => void handleTurnTileClick(col.subId, col.subName, points, tileKey)}
                            className={`min-h-[46px] h-12 rounded-xl border font-mono tabular-nums text-base font-extrabold transition-all flex items-center justify-center gap-1 select-none ${
                              isUsed
                                ? 'bg-[#F3F5E9]/70 border-[#E5E8DD]/70 text-[#666B62]/60 cursor-not-allowed'
                                : isActiveSelected
                                ? 'bg-[#FEF2EC] border-[#F07842] text-[#D9602B] ring-2 ring-[#F07842]/30'
                                : canClick
                                ? 'bg-[#F7F8F1] hover:bg-[#F07842] border-[#E5E8DD] hover:border-[#F07842] text-[#1B1F1C] hover:text-white cursor-pointer active:scale-[0.98]'
                                : 'bg-[#F7F8F1] border-[#E5E8DD] text-[#1B1F1C]/75 cursor-not-allowed'
                            }`}
                          >
                            {isUsed ? (
                              <>
                                <Check className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                <span className="line-through text-sm">{points}</span>
                              </>
                            ) : isExhausted ? (
                              <span className="text-[10px] font-sans font-bold text-[#F07842]">منتهية</span>
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

            {/* Desktop 6-Column Board */}
            <div className="hidden lg:block overflow-x-auto pb-1">
              <div
                className="grid gap-3 min-w-[700px]"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, onlineBoardColumns.length)}, minmax(136px, 1fr))`,
                }}
              >
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
                      style={{ backgroundColor: col.bgTint, borderColor: col.borderTint }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ backgroundColor: isWkCol ? '#F07842' : col.accentColor }}
                      />
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#14543D] pt-0.5">
                        <CategoryIcon iconName={col.iconName} color={col.accentColor} className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{col.mainCategoryName}</span>
                      </div>
                      <div className="font-display font-bold text-sm sm:text-base text-[#1B1F1C] leading-snug line-clamp-2">
                        {col.subName}
                      </div>
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#FFFFFF]/90 border border-[#E5E8DD] text-[10px] font-bold text-[#1B1F1C] max-w-full">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.ownerColor }} />
                        <span className="truncate max-w-[110px]">{col.ownerLabel}</span>
                      </div>
                    </div>
                  );
                })}

                {POINT_TIERS.map((points) => (
                  <React.Fragment key={points}>
                    {onlineBoardColumns.map((col) => {
                      const tileKey = `${col.subId}__${points}`;
                      const isUsed = (currentRoom.usedTileKeys || []).includes(tileKey);
                      const isActiveSelected = currentRoom.activeQuestion?.tileKey === tileKey;
                      const isWkCol = isWalaKalimaCategory({
                        subcategoryId: col.subId,
                        subcategoryName: col.subName,
                        mainCategoryName: col.mainCategoryName,
                      });
                      const slot = !isUsed && !isWkCol && isMyTurn ? findSlotForTile(col.subId, col.subName, points, tileKey) : null;
                      const isExhausted = Boolean(!isWkCol && slot && !slot.question && slot.isExhausted);
                      const canClick = isMyTurn && !isUsed && !currentRoom.activeQuestion && !isExhausted;

                      return (
                        <button
                          key={`${col.subId}_${points}`}
                          type="button"
                          disabled={!canClick}
                          onClick={() => void handleTurnTileClick(col.subId, col.subName, points, tileKey)}
                          className={`h-18 md:h-20 rounded-2xl border font-mono tabular-nums text-xl md:text-2xl font-extrabold transition-all duration-150 flex flex-col items-center justify-center select-none ${
                            isUsed
                              ? 'bg-[#F3F5E9]/70 border-[#E5E8DD]/70 text-[#666B62]/60 cursor-not-allowed'
                              : isActiveSelected
                              ? 'bg-[#FEF2EC] border-[#F07842] text-[#D9602B] ring-2 ring-[#F07842]/30 shadow-sm'
                              : canClick
                              ? 'bg-[#F7F8F1] hover:bg-[#F07842] border-[#E5E8DD] hover:border-[#F07842] text-[#1B1F1C] hover:text-white hover:-translate-y-0.5 hover:shadow-md cursor-pointer'
                              : 'bg-[#F7F8F1] border-[#E5E8DD] text-[#1B1F1C]/75 cursor-not-allowed'
                          }`}
                        >
                          {isUsed ? (
                            <div className="flex flex-col items-center leading-none gap-1">
                              <span className="line-through text-base md:text-xl">{points}</span>
                              <span className="text-[10px] font-sans font-semibold inline-flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> مستخدم
                              </span>
                            </div>
                          ) : isExhausted ? (
                            <span className="text-[10px] font-sans font-bold text-[#F07842]">خلصت الجديدة</span>
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
          </section>

          {/* Live Chronological Events & Answers History */}
          <section className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#14543D]" />
                <h2 className="font-display text-sm sm:text-base font-bold text-[#1B1F1C]">
                  سجل الأحداث والإجابات المباشر
                </h2>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-[#52574E]">
                {recentEvents.length} حدث
              </span>
            </div>

            {recentEvents.length === 0 ? (
              <p className="text-xs text-[#52574E]">ستظهر جميع الاختيارات والإجابات والنتائج هنا مباشرة.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {recentEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      ev.type === 'answer_submitted'
                        ? ev.isCorrect
                          ? 'bg-[#EAF2EE]/55 border-[#14543D]/25'
                          : 'bg-[#FEF2EC]/55 border-[#F07842]/25'
                        : 'bg-[#F7F8F1] border-[#E5E8DD]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-[#1B1F1C]">{ev.message}</div>
                      {ev.questionText && (
                        <div className="text-[11px] text-[#52574E]">
                          السؤال ({ev.subcategoryName} • {ev.points} نقطة): {ev.questionText}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-[#52574E] shrink-0">
                      {formatEventTime(ev.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SYNCHRONIZED WALA KALIMA MODAL FOR ACTIVE TURN PLAYER */}
          {(activeOnlineWkTile || currentRoom.activeQuestion?.isWalaKalima) && (() => {
            const aq = currentRoom.activeQuestion;
            const targetTeam = activeTurnRole === 'host' ? hostTeam : guestTeam;
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
                  id: targetTeam.id,
                  name: targetTeam.name,
                  color: targetTeam.color,
                  players: [currentTurnPlayerName],
                }}
                teams={currentRoom.teams}
                canControl={isMyTurn}
                settings={walaKalimaSettings}
                sharedOnlineSession={aq?.walaKalimaMeta || null}
                onOnlineSessionCreated={async (created) => {
                  if (!isMyTurn) return;
                  await syncOnlineWalaKalimaState(currentRoom.code, {
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
                    openedByHostId: myUid,
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
                  if (!isMyTurn || !currentRoom.activeQuestion?.isWalaKalima) return;
                  await syncOnlineWalaKalimaState(currentRoom.code, {
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
                onCommitResult={async ({ earnedPoints, tileKey, sessionId }) => {
                  if (!isMyTurn) return;
                  await commitOnlineWalaKalimaResult({
                    code: currentRoom.code,
                    tileKey,
                    sessionId,
                    earnedPoints: Math.max(0, earnedPoints),
                  });
                  setActiveOnlineWkTile(null);
                }}
                onCancel={async () => {
                  if (isMyTurn && currentRoom.activeQuestion?.isWalaKalima) {
                    await syncOnlineWalaKalimaState(currentRoom.code, null);
                  }
                  setActiveOnlineWkTile(null);
                }}
              />
            );
          })()}

          {/* SYNCHRONIZED TURN-BASED QUESTION & ANSWER MODAL */}
          {currentRoom.activeQuestion && !currentRoom.activeQuestion.isWalaKalima && (() => {
            const aq = currentRoom.activeQuestion;
            const isResolved = aq.submissionStatus === 'resolved' || aq.isAnswerRevealed;
            const isAudioWaiting = !isResolved && inferQuestionMediaType(aq) === 'audio' && !onlineAudioReady;
            const questionOwnerName = aq.openedByName || currentTurnPlayerName;
            const amIOwnerWhoOpened =
              Boolean(myRole && aq.openedByRole === myRole) ||
              (isResolved ? false : isMyTurn);

            return (
              <div
                className="fixed inset-0 z-50 bg-[#1B1F1C]/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
                role="dialog"
                aria-modal="true"
                aria-label={`سؤال ${aq.subcategoryName} بقيمة ${aq.points} نقطة`}
              >
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-3xl overflow-hidden max-w-2xl w-full max-h-[94dvh] flex flex-col shadow-2xl">
                  {/* Modal Header */}
                  <div className="bg-[#1B1F1C] text-white px-3.5 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/10 text-white border border-white/15 truncate max-w-[160px] sm:max-w-none">
                        {aq.subcategoryName}
                      </span>
                      <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-white bg-[#F07842] px-2.5 py-1 rounded-lg">
                        {aq.points} نقطة
                      </span>
                      <span className="text-[11px] font-bold text-white/80">
                        اختاره: {questionOwnerName}
                      </span>
                    </div>

                    {!isResolved && (
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono tabular-nums text-xs sm:text-sm font-bold ${
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
                        <span>{isAudioWaiting ? `متوقف (${modalTimeLeft}ث)` : `${modalTimeLeft}ث`}</span>
                      </div>
                    )}
                  </div>

                  {!isResolved && (
                    <div aria-hidden="true" className="h-1.5 w-full bg-[#E5E8DD] overflow-hidden shrink-0">
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
                  )}

                  <div className="p-4 sm:p-6 md:p-7 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
                    {/* Question Text & Media */}
                    <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-2xl p-4 sm:p-6 space-y-4 text-center">
                      <h3 className="font-display text-base sm:text-xl md:text-2xl font-bold text-[#1B1F1C] leading-relaxed">
                        {aq.questionText}
                      </h3>

                      {inferQuestionMediaType(aq) === 'image' && aq.imageUrl && (
                        onlineImageLoadFailed ? (
                          <div className="bg-[#FFFFFF] border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-rose-800">تعذر تحميل صورة السؤال</span>
                            <button
                              type="button"
                              onClick={() => {
                                setOnlineImageLoadFailed(false);
                                setOnlineImageRetryNonce((n) => n + 1);
                              }}
                              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#F07842] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>إعادة المحاولة</span>
                            </button>
                          </div>
                        ) : (
                          <div className="max-w-lg mx-auto rounded-2xl overflow-hidden border border-[#E5E8DD] bg-[#FFFFFF] p-2 space-y-2">
                            <div className="relative flex items-center justify-center">
                              <img
                                key={`${aq.imageUrl}_${onlineImageRetryNonce}`}
                                src={aq.imageUrl}
                                referrerPolicy="no-referrer"
                                alt={aq.imageDescription || 'صورة السؤال'}
                                onError={() => setOnlineImageLoadFailed(true)}
                                onClick={() => setOnlineZoomedImageUrl(aq.imageUrl || null)}
                                className="w-full max-h-[180px] sm:max-h-72 object-contain rounded-xl cursor-zoom-in"
                              />
                              <button
                                type="button"
                                onClick={() => setOnlineZoomedImageUrl(aq.imageUrl || null)}
                                className="absolute bottom-2 left-2 min-h-[36px] px-2.5 py-1 rounded-lg bg-[#1B1F1C]/85 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <ZoomIn className="w-3.5 h-3.5" />
                                <span>تكبير</span>
                              </button>
                            </div>
                          </div>
                        )
                      )}

                      {inferQuestionMediaType(aq) === 'audio' && aq.audioUrl && (
                        <QuestionAudioPlayer
                          audioUrl={aq.audioUrl}
                          maxPlays={aq.audioMaxPlays ?? null}
                          questionKey={`online_${currentRoom.code}_${aq.tileKey}_${aq.openedAt}`}
                          onReadyChange={(ready) => {
                            setOnlineAudioReady(ready);
                            if (ready && audioLoadingStartedAtRef.current) {
                              setOnlineAudioLoadWaitMs(Math.max(0, Date.now() - audioLoadingStartedAtRef.current));
                              audioLoadingStartedAtRef.current = null;
                            } else if (!ready && !audioLoadingStartedAtRef.current) {
                              audioLoadingStartedAtRef.current = Date.now();
                            }
                          }}
                        />
                      )}
                    </div>

                    {/* ANSWER SUBMISSION OR RESOLVED VERIFICATION RESULT */}
                    {isResolved ? (
                      <div className="space-y-4">
                        <div
                          className={`p-4 sm:p-5 rounded-2xl border-2 text-center space-y-2.5 ${
                            aq.isCorrect
                              ? 'bg-[#EAF2EE] border-[#14543D]'
                              : 'bg-[#FEF2EC] border-[#F07842]'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            {aq.isCorrect ? (
                              <CheckCircle2 className="w-6 h-6 text-[#14543D]" />
                            ) : (
                              <ShieldAlert className="w-6 h-6 text-[#D9632E]" />
                            )}
                            <span
                              className={`font-display text-lg sm:text-xl font-bold ${
                                aq.isCorrect ? 'text-[#14543D]' : 'text-[#D9632E]'
                              }`}
                            >
                              {aq.isCorrect
                                ? `إجابة صحيحة! (+${aq.earnedPoints || aq.points} نقطة)`
                                : 'إجابة خاطئة (0 نقطة)'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-right">
                            <div className="p-3 rounded-xl bg-white border border-[#E5E8DD]">
                              <div className="text-[11px] font-bold text-[#52574E]">
                                إجابة {aq.submittedByName || questionOwnerName}:
                              </div>
                              <div className="font-display text-sm font-bold text-[#1B1F1C] mt-0.5">
                                {aq.submittedAnswer || '—'}
                              </div>
                            </div>
                            <div className="p-3 rounded-xl bg-white border border-[#14543D]/30">
                              <div className="text-[11px] font-bold text-[#14543D]">
                                الإجابة الصحيحة المعتمدة:
                              </div>
                              <div className="font-display text-sm font-bold text-[#1B1F1C] mt-0.5">
                                {aq.correctAnswer}
                              </div>
                            </div>
                          </div>

                          {aq.explanation && (
                            <p className="text-xs text-[#52574E] pt-1 leading-relaxed">
                              {aq.explanation}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                          <div className="text-xs font-bold text-[#14543D] bg-[#EAF2EE] px-4 py-2.5 rounded-xl border border-[#14543D]/20 w-full sm:w-auto text-center">
                            الدور التالي عند: {currentTurnPlayerName} ({activeTurnRole === 'host' ? 'المضيف' : 'الضيف'})
                          </div>

                          {myRole && (
                            <button
                              type="button"
                              disabled={isDismissingResult}
                              onClick={() => void handleDismissResult()}
                              className="w-full sm:w-auto min-h-[48px] px-7 py-3 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-sm font-bold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                              <Check className="w-4 h-4" />
                              <span>متابعة إلى اللوحة</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : amIOwnerWhoOpened ? (
                      <form onSubmit={handleSubmitPlayerAnswer} className="space-y-3">
                        <label className="block text-xs font-bold text-[#1B1F1C]">
                          اكتب إجابتك (يتم التحقق تلقائياً ومباشرة لدى الطرفين):
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <input
                            type="text"
                            autoFocus
                            value={answerDraft}
                            onChange={(e) => setAnswerDraft(e.target.value)}
                            disabled={isSubmittingAnswer}
                            placeholder="اكتب إجابتك هنا..."
                            className="flex-1 min-h-[48px] px-4 py-3 rounded-xl bg-[#F7F8F1] border-2 border-[#E5E8DD] focus:bg-[#FFFFFF] focus:border-[#14543D] outline-none text-sm font-bold text-[#1B1F1C]"
                          />
                          <button
                            type="submit"
                            disabled={!answerDraft.trim() || isSubmittingAnswer}
                            className="min-h-[48px] px-6 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] disabled:opacity-50 text-white text-sm font-bold cursor-pointer flex items-center justify-center gap-2 shrink-0"
                          >
                            <Send className="w-4 h-4" />
                            <span>{isSubmittingAnswer ? 'جاري التحقق...' : 'إرسال الإجابة'}</span>
                          </button>
                        </div>

                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            disabled={isSubmittingAnswer}
                            onClick={() => void handleSkipCurrentQuestion()}
                            className="min-h-[42px] px-4 py-2 rounded-xl border border-[#E5E8DD] text-xs font-bold text-[#52574E] hover:text-rose-700 hover:bg-rose-50 cursor-pointer flex items-center gap-1.5"
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                            <span>تخطي السؤال (0 نقطة)</span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="p-4 rounded-2xl bg-[#F7F8F1] border border-[#E5E8DD] text-center space-y-1.5">
                        <div className="text-xs font-bold text-[#14543D] flex items-center justify-center gap-2">
                          <Clock className="w-4 h-4 text-[#F07842]" />
                          <span>
                            يكتب {questionOwnerName} إجابته الآن...
                          </span>
                        </div>
                        <p className="text-[11px] text-[#52574E]">
                          ستظهر الإجابة المرسلة والنتيجة والإجابة المعتمدة هنا فور إرسالها.
                        </p>
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
            >
              <div
                className="relative max-w-5xl max-h-[92dvh] flex flex-col items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setOnlineZoomedImageUrl(null)}
                  className="self-end min-h-[44px] px-3.5 py-2 rounded-xl bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>إغلاق التكبير</span>
                </button>
                <img
                  src={onlineZoomedImageUrl}
                  referrerPolicy="no-referrer"
                  alt="صورة السؤال مكبرة"
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
  // 4. RESULTS SCREEN
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
        transition={{ duration: 0.28 }}
        className="max-w-[840px] mx-auto px-3 sm:px-6 py-6 md:py-12 text-center space-y-6"
      >
        <div className="relative overflow-hidden bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-8 md:p-11 space-y-6 shadow-xl">
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
            subtitleMeta={`منافسة أونلاين · غرفة ${currentRoom.code}`}
            effects={effects}
          />

          <div className="space-y-3 pt-1 max-w-lg mx-auto text-right">
            {onlineOutcome.sortedTeams.map((team, idx) => {
              const isTop = team.score === onlineOutcome.topScore && onlineOutcome.topScore > 0;
              const rankNum = onlineOutcome.teamRanks[idx] ?? idx + 1;
              const roleBadge = team.id === hostTeam.id ? 'المضيف' : 'الضيف';
              return (
                <div
                  key={team.id}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                    isTop ? 'bg-[#F7F8F1] border-[#F07842]/50 shadow-sm' : 'bg-[#FFFFFF] border-[#E5E8DD]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-mono tabular-nums font-extrabold text-sm text-white shrink-0"
                      style={{ backgroundColor: team.color }}
                    >
                      #{rankNum}
                    </span>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm sm:text-base text-[#1B1F1C] truncate">
                        {team.id === hostTeam.id ? hostDisplayName : guestDisplayName}
                      </div>
                      <div className="text-[11px] font-bold text-[#52574E]">{roleBadge}</div>
                    </div>
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
                </div>
              );
            })}
          </div>

          {recentEvents.length > 0 && (
            <div className="pt-4 border-t border-[#E5E8DD] text-right space-y-2 max-w-xl mx-auto">
              <div className="text-xs font-bold text-[#14543D] flex items-center gap-1.5">
                <History className="w-4 h-4" />
                <span>ملخص أحداث المباراة ({recentEvents.length})</span>
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1.5">
                {recentEvents.slice(0, 12).map((ev) => (
                  <div key={ev.id} className="p-2.5 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] text-[11px] text-[#1B1F1C]">
                    {ev.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-5 border-t border-[#E5E8DD] flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3">
            {isHost ? (
              <button
                type="button"
                onClick={() => void hostRestartGame(currentRoom.code).catch((e) => setErrorMsg(e?.message))}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 rounded-xl bg-[#F07842] text-[#FFFFFF] text-sm font-bold hover:bg-[#D9632E] cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>جولة جديدة بنفس الغرفة</span>
              </button>
            ) : (
              <div className="text-xs font-bold text-[#52574E]">
                {isSpectator
                  ? 'انتهت المباراة — كنت تشاهد هذه المواجهة كمشاهد.'
                  : 'بانتظار المضيف لبدء جولة جديدة.'}
              </div>
            )}

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm font-bold cursor-pointer flex items-center justify-center gap-2"
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
