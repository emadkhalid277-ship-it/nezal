import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, MotionConfig } from 'motion/react';
import {
  Check,
  Clock,
  Eye,
  RotateCcw,
  Trophy,
  Pause,
  Play,
  Users,
  Sparkles,
  Layers,
  Image as ImageIcon,
  ZoomIn,
  X,
  Lock,
  Volume2,
  VolumeX,
  ShieldAlert,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  MainCategoryMeta,
  PointValue,
  QuestionDedupSettings,
  SubcategoryItem,
  TeamConfig,
  TriviaQuestion,
  VisualEffectsSettings,
} from '../types/game';
import { MAIN_CATEGORIES } from '../data/categoriesAndSeed';
import { CategoryIcon } from '../components/CategoryIcon';
import { QuestionAudioPlayer } from '../components/QuestionAudioPlayer';
import {
  AnimatedScoreCounter,
  AnswerFeedbackBanner,
  AnswerFeedbackFlash,
  getQuestionCardFeedbackAnimation,
  useEffectiveVisualEffects,
} from '../components/GameVisualEffects';
import {
  inferQuestionMediaType,
  matchesSubcategoryQuestion,
} from '../services/questionService';
import { soundFX } from '../services/soundEffects';
import {
  DEFAULT_QUESTION_DEDUP_SETTINGS,
  selectNextQuestionForSlot,
  SlotSelectionResult,
} from '../utils/questionDedupLogic';
import {
  DEFAULT_WALA_KALIMA_SETTINGS,
  isWalaKalimaCategory,
  WalaKalimaSettings,
} from '../types/walaKalima';
import { WalaKalimaBoardModal } from '../components/WalaKalimaBoardModal';
import { WhoAnsweredCorrectlyPanel } from '../components/WhoAnsweredCorrectlyPanel';
import { POINT_TO_DIFFICULTY } from '../types/game';

interface OrderedTeamSelectionItem {
  subcategoryId: string;
  subcategoryName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  teamIndex: number;
}

interface GameBoardPageProps {
  teams: TeamConfig[];
  mainCategories?: MainCategoryMeta[];
  orderedTeamSelections?: OrderedTeamSelectionItem[];
  selectedSubcategories: string[];
  subcategories: SubcategoryItem[];
  activeTeamIndex: number;
  usedTileKeys: string[];
  roundUsedQuestionIds?: string[];
  usedQuestionIds: string[];
  timerDuration: number;
  approvedQuestions: TriviaQuestion[];
  isGameLocked?: boolean;
  userId?: string | null;
  seenQuestionIds?: Set<string>;
  questionDedupSettings?: QuestionDedupSettings;
  onRecordQuestionSeen?: (params: {
    questionId: string;
    category: string;
    subcategoryId?: string;
    mode: 'local' | 'online';
    displayKey?: string;
  }) => Promise<void> | void;
  onAwardPoints: (
    teamIndex: number,
    points: number,
    tileKey: string,
    questionId: string,
    playableTilesCount?: number
  ) => void;
  onMarkTileUsedNoPoints: (
    tileKey: string,
    questionId: string,
    playableTilesCount?: number
  ) => void;
  onSelectTurn: (teamIndex: number) => void;
  onFinishGame: () => void;
  onResetBoard: () => void;
  onGoToSetup: () => void;
  onGoToCategories: () => void;
  isAdmin: boolean;
  onSeedQuestions: () => Promise<void>;
  seeding: boolean;
  onActiveQuestionChange?: (state: any) => void;
  visualEffectsSettings?: VisualEffectsSettings;
  matchId?: string;
  walaKalimaSettings?: WalaKalimaSettings;
}

const POINT_TIERS: PointValue[] = [100, 200, 300, 400, 500];
const PINNED_TILES_STORAGE_KEY = 'nizal_pinned_tile_questions_v1';
const ACTIVE_MODAL_STORAGE_KEY = 'nizal_active_question_modal_v1';

interface ActiveSelectionState {
  tileKey: string;
  subcategoryId?: string;
  subcategoryName: string;
  mainCategoryName: string;
  points: PointValue;
  question: TriviaQuestion;
  isRepeatedFallback?: boolean;
}

export const GameBoardPage: React.FC<GameBoardPageProps> = ({
  teams,
  mainCategories = MAIN_CATEGORIES,
  orderedTeamSelections = [],
  selectedSubcategories,
  subcategories,
  activeTeamIndex,
  visualEffectsSettings,
  usedTileKeys,
  roundUsedQuestionIds = [],
  usedQuestionIds,
  timerDuration,
  approvedQuestions,
  isGameLocked = false,
  userId = null,
  seenQuestionIds,
  questionDedupSettings = DEFAULT_QUESTION_DEDUP_SETTINGS,
  onRecordQuestionSeen,
  onAwardPoints,
  onMarkTileUsedNoPoints,
  onSelectTurn,
  onFinishGame,
  onResetBoard,
  onGoToSetup,
  onGoToCategories,
  isAdmin,
  onSeedQuestions,
  seeding,
  onActiveQuestionChange,
  matchId = 'local_match',
  walaKalimaSettings = DEFAULT_WALA_KALIMA_SETTINGS,
}) => {
  const [activeWalaKalimaTile, setActiveWalaKalimaTile] = useState<{
    tileKey: string;
    subcategoryId?: string;
    subcategoryName: string;
    mainCategoryName: string;
    points: PointValue;
  } | null>(null);
  const [showMobileBoardMenu, setShowMobileBoardMenu] = useState(false);
  // Pinned question IDs per tileKey for the current round so closing & reopening a tile keeps the same question
  const [pinnedTileQuestions, setPinnedTileQuestions] = useState<
    Record<string, string>
  >(() => {
    try {
      const saved = localStorage.getItem(PINNED_TILES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return {};
  });

  const [activeSelection, setActiveSelection] =
    useState<ActiveSelectionState | null>(() => {
      try {
        const saved = localStorage.getItem(ACTIVE_MODAL_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.activeSelection?.tileKey) {
            return parsed.activeSelection;
          }
        }
      } catch {
        // ignore storage errors
      }
      return null;
    });

  const [answerRevealed, setAnswerRevealed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_MODAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Boolean(parsed?.answerRevealed);
      }
    } catch {
      // ignore
    }
    return false;
  });

  const [timeLeft, setTimeLeft] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_MODAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.timeLeft === 'number') {
          return Math.max(0, parsed.timeLeft);
        }
      }
    } catch {
      // ignore
    }
    return timerDuration;
  });

  const [timerPaused, setTimerPaused] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_MODAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Boolean(parsed?.timerPaused);
      }
    } catch {
      // ignore
    }
    return false;
  });

  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState<boolean>(false);
  const [imageRetryNonce, setImageRetryNonce] = useState<number>(0);
  const [mediaAudioReady, setMediaAudioReady] = useState<boolean>(true);
  const [audioPlaysUsed, setAudioPlaysUsed] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_MODAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.audioPlaysUsed === 'number') {
          return Math.max(0, parsed.audioPlaysUsed);
        }
      }
    } catch {
      // ignore
    }
    return 0;
  });

  useEffect(() => {
    setZoomedImageUrl(null);
    setImageLoadFailed(false);
    setImageRetryNonce(0);
    const mType = inferQuestionMediaType(activeSelection?.question);
    setMediaAudioReady(mType !== 'audio');
  }, [
    activeSelection?.question?.id,
    activeSelection?.question?.imageUrl,
    activeSelection?.question?.audioUrl,
  ]);

  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'correct' | 'wrong';
    text: string;
  } | null>(null);
  const [pendingJudgmentChoice, setPendingJudgmentChoice] = useState<
    number | 'none' | null
  >(null);

  const isSubmittingRef = useRef(false);
  const onActiveQuestionChangeRef = useRef(onActiveQuestionChange);
  onActiveQuestionChangeRef.current = onActiveQuestionChange;
  const onRecordQuestionSeenRef = useRef(onRecordQuestionSeen);
  onRecordQuestionSeenRef.current = onRecordQuestionSeen;
  const effects = useEffectiveVisualEffects(visualEffectsSettings);
  const judgmentTimeoutRef = useRef<number | null>(null);
  const prevTimeLeftRef = useRef<number>(timeLeft);
  const prevTeamScoresRef = useRef<Record<string, number>>(
    Object.fromEntries(teams.map((t) => [t.id, t.score]))
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    soundFX.isEnabled()
  );

  useEffect(() => {
    return soundFX.subscribe(setSoundEnabled);
  }, []);

  useEffect(() => {
    const prevScores = prevTeamScoresRef.current;
    let scoredTeamIdx = -1;
    teams.forEach((team, idx) => {
      const prevScore = prevScores[team.id];
      if (typeof prevScore === 'number' && team.score > prevScore && scoredTeamIdx === -1) {
        scoredTeamIdx = idx;
      }
    });

    prevTeamScoresRef.current = Object.fromEntries(
      teams.map((t) => [t.id, t.score])
    );

    if (scoredTeamIdx >= 0) {
      soundFX.playTeamScore(scoredTeamIdx);
    }
  }, [teams]);

  useEffect(() => {
    return () => {
      if (judgmentTimeoutRef.current) {
        window.clearTimeout(judgmentTimeoutRef.current);
      }
    };
  }, []);

  // Clear pinned questions if board is reset (usedTileKeys becomes empty and no modal open)
  useEffect(() => {
    if (usedTileKeys.length === 0 && !activeSelection) {
      setPinnedTileQuestions({});
      try {
        localStorage.removeItem(PINNED_TILES_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [usedTileKeys.length, activeSelection]);

  // Persist pinned tile questions
  useEffect(() => {
    try {
      localStorage.setItem(
        PINNED_TILES_STORAGE_KEY,
        JSON.stringify(pinnedTileQuestions)
      );
    } catch {
      // ignore
    }
  }, [pinnedTileQuestions]);

  // Persist active question modal state so refreshing mid-question restores cleanly
  useEffect(() => {
    try {
      if (!activeSelection) {
        localStorage.removeItem(ACTIVE_MODAL_STORAGE_KEY);
        onActiveQuestionChangeRef.current?.(null);
      } else {
        localStorage.setItem(
          ACTIVE_MODAL_STORAGE_KEY,
          JSON.stringify({
            activeSelection,
            answerRevealed,
            timeLeft,
            timerPaused,
            audioPlaysUsed,
          })
        );
        onActiveQuestionChangeRef.current?.({
          tileKey: activeSelection.tileKey,
          subcategoryId: activeSelection.subcategoryId,
          subcategoryName: activeSelection.subcategoryName,
          mainCategoryName: activeSelection.mainCategoryName,
          points: activeSelection.points,
          questionId: activeSelection.question.id,
          questionText: activeSelection.question.questionText,
          correctAnswer: activeSelection.question.correctAnswer,
          mediaType: inferQuestionMediaType(activeSelection.question),
          imageUrl: activeSelection.question.imageUrl,
          imageDescription: activeSelection.question.imageDescription,
          audioUrl: activeSelection.question.audioUrl,
          audioMaxPlays: activeSelection.question.audioMaxPlays ?? null,
          audioPlaysUsed,
          explanation: activeSelection.question.explanation,
          answerRevealed,
          timeLeft,
          timerPaused,
        });
      }
    } catch {
      // ignore
    }
  }, [
    activeSelection,
    answerRevealed,
    timeLeft,
    timerPaused,
    audioPlaysUsed,
  ]);

  // If the currently open tile was already marked used (e.g. from another tab/action), close modal
  useEffect(() => {
    if (activeSelection && usedTileKeys.includes(activeSelection.tileKey)) {
      setActiveSelection(null);
      setFeedbackBanner(null);
      setPendingJudgmentChoice(null);
      isSubmittingRef.current = false;
    }
  }, [activeSelection, usedTileKeys]);

  const activeMediaType = inferQuestionMediaType(activeSelection?.question);
  const isWaitingForAudioReady =
    Boolean(activeSelection) && activeMediaType === 'audio' && !mediaAudioReady;

  // Primary countdown timer effect (paused automatically while audio is loading/failed)
  useEffect(() => {
    if (
      !activeSelection ||
      timerPaused ||
      isWaitingForAudioReady ||
      answerRevealed ||
      feedbackBanner
    ) {
      prevTimeLeftRef.current = timeLeft;
      return;
    }

    if (prevTimeLeftRef.current > 0 && timeLeft === 0) {
      soundFX.playTimeUp();
    } else if (
      prevTimeLeftRef.current !== timeLeft &&
      timeLeft > 0 &&
      timeLeft <= 5
    ) {
      soundFX.playTimerTick();
    }
    prevTimeLeftRef.current = timeLeft;

    if (timeLeft <= 0) return;

    const interval = window.setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [
    activeSelection,
    timerPaused,
    isWaitingForAudioReady,
    answerRevealed,
    feedbackBanner,
    timeLeft,
  ]);

  // Resolve visual styling for each selected subcategory from its parent Main Category & selecting team
  const boardColumns = useMemo(() => {
    if (orderedTeamSelections.length > 0) {
      return orderedTeamSelections.map((sel) => {
        const subObj =
          subcategories.find((s) => s.id === sel.subcategoryId) ||
          subcategories.find((s) => s.name === sel.subcategoryName);
        const parentMain =
          mainCategories.find(
            (m) =>
              (subObj?.mainCategoryId && m.id === subObj.mainCategoryId) ||
              m.name === subObj?.mainCategory
          ) ||
          mainCategories[0] ||
          MAIN_CATEGORIES[0];

        return {
          subId: subObj?.id || sel.subcategoryId,
          subName: subObj?.name || sel.subcategoryName,
          teamName: sel.teamName,
          teamColor: sel.teamColor,
          mainCategoryName: parentMain.name,
          accentColor: parentMain.accentColor,
          bgTint: parentMain.bgTint,
          borderTint: parentMain.borderTint,
          iconName: parentMain.iconName,
        };
      });
    }

    return selectedSubcategories.map((subName) => {
      const subObj = subcategories.find((s) => s.name === subName);
      const parentMain =
        mainCategories.find(
          (m) =>
            (subObj?.mainCategoryId && m.id === subObj.mainCategoryId) ||
            m.name === subObj?.mainCategory
        ) ||
        mainCategories[0] ||
        MAIN_CATEGORIES[0];

      return {
        subId: subObj?.id,
        subName,
        teamName: '',
        teamColor: '',
        mainCategoryName: parentMain.name,
        accentColor: parentMain.accentColor,
        bgTint: parentMain.bgTint,
        borderTint: parentMain.borderTint,
        iconName: parentMain.iconName,
      };
    });
  }, [
    orderedTeamSelections,
    selectedSubcategories,
    subcategories,
    mainCategories,
  ]);

  // Fast pre-indexed lookup map for questions by subcategory and point value
  const questionsBySlotMap = useMemo(() => {
    const map = new Map<string, TriviaQuestion[]>();
    for (const q of approvedQuestions) {
      if (q.subcategoryId) {
        const keyId = `${q.subcategoryId}__${q.points}`;
        if (!map.has(keyId)) map.set(keyId, []);
        map.get(keyId)!.push(q);
      }
      const keyName = `${q.category}__${q.points}`;
      if (!map.has(keyName)) map.set(keyName, []);
      map.get(keyName)!.push(q);
    }
    return map;
  }, [approvedQuestions]);

  const [exhaustionAlert, setExhaustionAlert] = useState<string | null>(null);

  // Find an available approved question for a subcategory + point tier while excluding seen history per UID
  const getSlotSelection = (
    subcategoryName: string,
    points: PointValue,
    subcategoryId?: string
  ): SlotSelectionResult => {
    const tileKey = `${subcategoryName}__${points}`;

    let matching =
      (subcategoryId && questionsBySlotMap.get(`${subcategoryId}__${points}`)) ||
      questionsBySlotMap.get(`${subcategoryName}__${points}`);

    if (!matching || matching.length === 0) {
      matching = approvedQuestions.filter(
        (q) =>
          matchesSubcategoryQuestion(
            q.category,
            subcategoryName,
            q.subcategoryId,
            subcategoryId
          ) && q.points === points
      );
    }

    return selectNextQuestionForSlot({
      candidates: matching || [],
      tileKey,
      pinnedTileQuestions,
      currentlyOpenTileKey: activeSelection?.tileKey || null,
      roundUsedQuestionIds,
      sessionUsedQuestionIds: usedQuestionIds,
      userSeenQuestionIds: seenQuestionIds || new Set<string>(),
      allowRepeatAfterExhaustion: Boolean(
        questionDedupSettings?.allowRepeatAfterExhaustion
      ),
    });
  };

  // Count how many tiles on this board are actually playable and detect exhausted categories
  const { playableTilesCount, exhaustedColumnNames, exhaustedSubKeySet } =
    useMemo(() => {
      let count = 0;
      const exhaustedNames: string[] = [];
      const exhaustedKeys = new Set<string>();

      for (const col of boardColumns) {
        let colPlayableUnused = 0;
        let colHasExhaustedUnused = false;
        const colKey = col.subId || col.subName;
        const isWkCol = isWalaKalimaCategory({
          subcategoryId: col.subId,
          subcategoryName: col.subName,
          mainCategoryName: col.mainCategoryName,
        });

        for (const pts of POINT_TIERS) {
          const tileKey = `${col.subName}__${pts}`;
          if (usedTileKeys.includes(tileKey)) {
            count++;
          } else if (isWkCol) {
            count++;
            colPlayableUnused++;
          } else {
            const slot = getSlotSelection(col.subName, pts, col.subId);
            if (slot.question) {
              count++;
              colPlayableUnused++;
            } else if (slot.isExhausted) {
              colHasExhaustedUnused = true;
            }
          }
        }

        if (colPlayableUnused === 0 && colHasExhaustedUnused) {
          exhaustedNames.push(col.subName);
          exhaustedKeys.add(colKey);
        }
      }

      return {
        playableTilesCount: count,
        exhaustedColumnNames: exhaustedNames,
        exhaustedSubKeySet: exhaustedKeys,
      };
    }, [
      boardColumns,
      usedTileKeys,
      approvedQuestions,
      roundUsedQuestionIds,
      usedQuestionIds,
      pinnedTileQuestions,
      seenQuestionIds,
      questionDedupSettings?.allowRepeatAfterExhaustion,
      activeSelection?.tileKey,
    ]);

  const handleTileClick = (
    subcategoryName: string,
    mainCategoryName: string,
    points: PointValue,
    subcategoryId?: string
  ) => {
    const tileKey = `${subcategoryName}__${points}`;
    if (usedTileKeys.includes(tileKey)) return;

    if (
      isWalaKalimaCategory({
        subcategoryId,
        subcategoryName,
        mainCategoryName,
      })
    ) {
      setExhaustionAlert(null);
      soundFX.playTileOpen();
      setActiveWalaKalimaTile({
        tileKey,
        subcategoryId,
        subcategoryName,
        mainCategoryName,
        points,
      });
      return;
    }

    const slot = getSlotSelection(subcategoryName, points, subcategoryId);
    if (!slot.question) {
      if (slot.isExhausted) {
        setExhaustionAlert(
          `خلصت الأسئلة الجديدة في هذي الفئة (${subcategoryName} - ${points} نقطة).`
        );
      }
      return;
    }

    const q = slot.question;
    setExhaustionAlert(null);
    soundFX.playTileOpen();
    isSubmittingRef.current = false;
    setPinnedTileQuestions((prev) =>
      prev[tileKey] === q.id ? prev : { ...prev, [tileKey]: q.id }
    );
    setActiveSelection({
      tileKey,
      subcategoryId,
      subcategoryName,
      mainCategoryName,
      points,
      question: q,
      isRepeatedFallback: slot.isRepeatedFallback,
    });
    setAnswerRevealed(false);
    setTimeLeft(timerDuration);
    prevTimeLeftRef.current = timerDuration;
    setTimerPaused(false);
    setAudioPlaysUsed(0);
    setMediaAudioReady(inferQuestionMediaType(q) !== 'audio');
    setFeedbackBanner(null);
    setPendingJudgmentChoice(null);
  };

  const totalTiles = boardColumns.length * POINT_TIERS.length;
  const remainingPlayableTiles = Math.max(
    0,
    playableTilesCount - usedTileKeys.length
  );
  const safeTeamIndex =
    activeTeamIndex >= 0 && activeTeamIndex < teams.length
      ? activeTeamIndex
      : 0;
  const activeTeam = teams[safeTeamIndex] || teams[0];

  const handleSelectWinnerTeam = (teamIndex: number) => {
    if (
      !activeSelection ||
      !answerRevealed ||
      feedbackBanner ||
      isSubmittingRef.current
    ) {
      return;
    }
    if (teamIndex < 0 || teamIndex >= teams.length) return;
    if (usedTileKeys.includes(activeSelection.tileKey)) return;

    isSubmittingRef.current = true;
    setPendingJudgmentChoice(teamIndex);
    const capturedSelection = activeSelection;
    const capturedTeamIndex = teamIndex;
    const winnerTeam = teams[capturedTeamIndex];

    soundFX.playCorrect();
    setFeedbackBanner({
      type: 'correct',
      text: `إجابة صحيحة لفريق ${
        winnerTeam?.name || `الفريق ${capturedTeamIndex + 1}`
      }! كسبوا +${capturedSelection.points} نقطة!`,
    });

    judgmentTimeoutRef.current = window.setTimeout(() => {
      onAwardPoints(
        capturedTeamIndex,
        capturedSelection.points,
        capturedSelection.tileKey,
        capturedSelection.question.id,
        playableTilesCount
      );
      setActiveSelection(null);
      setFeedbackBanner(null);
      setPendingJudgmentChoice(null);
      isSubmittingRef.current = false;
      judgmentTimeoutRef.current = null;
    }, 850);
  };

  const handleNoTeamAnswered = () => {
    if (
      !activeSelection ||
      !answerRevealed ||
      feedbackBanner ||
      isSubmittingRef.current
    ) {
      return;
    }
    if (usedTileKeys.includes(activeSelection.tileKey)) return;

    isSubmittingRef.current = true;
    setPendingJudgmentChoice('none');
    const capturedSelection = activeSelection;

    soundFX.playWrong();
    setFeedbackBanner({
      type: 'wrong',
      text: 'ولا فريق أجاب صح! لم تُضف أي نقاط وينتقل الدور للفريق التالي.',
    });

    judgmentTimeoutRef.current = window.setTimeout(() => {
      onMarkTileUsedNoPoints(
        capturedSelection.tileKey,
        capturedSelection.question.id,
        playableTilesCount
      );
      setActiveSelection(null);
      setFeedbackBanner(null);
      setPendingJudgmentChoice(null);
      isSubmittingRef.current = false;
      judgmentTimeoutRef.current = null;
    }, 850);
  };

  // Record displayed question to persistent UID seen-history ONLY after it actually renders to the player
  useEffect(() => {
    if (!activeSelection?.question?.id || !userId || !onRecordQuestionSeenRef.current) {
      return;
    }
    void onRecordQuestionSeenRef.current({
      questionId: activeSelection.question.id,
      category:
        activeSelection.subcategoryName ||
        activeSelection.question.category ||
        'عام',
      subcategoryId:
        activeSelection.subcategoryId ||
        activeSelection.question.subcategoryId ||
        '',
      mode: 'local',
      displayKey: `local_${activeSelection.tileKey}_${activeSelection.question.id}`,
    });
  }, [
    activeSelection?.question?.id,
    activeSelection?.tileKey,
    activeSelection?.subcategoryName,
    activeSelection?.subcategoryId,
    activeSelection?.question?.category,
    activeSelection?.question?.subcategoryId,
    userId,
  ]);

  const handleCloseModalWithoutScoring = () => {
    if (feedbackBanner || isSubmittingRef.current) {
      return;
    }
    const closingTileKey = activeSelection?.tileKey;
    if (closingTileKey) {
      setPinnedTileQuestions((prev) => {
        if (!prev[closingTileKey]) return prev;
        const copy = { ...prev };
        delete copy[closingTileKey];
        return copy;
      });
    }
    setActiveSelection(null);
    setFeedbackBanner(null);
    setPendingJudgmentChoice(null);
  };

  useEffect(() => {
    if (!zoomedImageUrl && !activeSelection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zoomedImageUrl) {
        setZoomedImageUrl(null);
        return;
      }
      if (activeSelection && !feedbackBanner && !isSubmittingRef.current) {
        handleCloseModalWithoutScoring();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomedImageUrl, activeSelection, feedbackBanner]);

  const timerRatio = Math.max(
    0,
    Math.min(100, (timeLeft / Math.max(1, timerDuration)) * 100)
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="max-w-[1420px] mx-auto px-3 sm:px-6 py-4 md:py-7 space-y-4 md:space-y-6">
        {/* 1. PERSISTENT ARENA SCOREBOARD BAR */}
        <section
          aria-label="لوحة النتائج والفرق"
          className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-3.5 sm:p-5 lg:p-6 shadow-xs space-y-4"
        >
          {/* Top Utility & Turn Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3 border-b border-[#E5E8DD] pb-3 sm:pb-3.5">
            <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-[#52574E]">
                  الدور الحين على:
                </span>
                {activeTeam && (
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-xs"
                    style={{ backgroundColor: activeTeam.color || '#14543D' }}
                  >
                    <span className="w-2 h-2 rounded-full bg-white" />
                    <span className="truncate max-w-[140px] sm:max-w-none">
                      {activeTeam.name || `الفريق ${safeTeamIndex + 1}`}
                    </span>
                  </div>
                )}
              </div>
              <span className="text-xs text-[#52574E] font-mono tabular-nums bg-[#F7F8F1] border border-[#E5E8DD] px-2.5 py-1 rounded-lg">
                المتبقي: {remainingPlayableTiles} /{' '}
                {playableTilesCount > 0 ? playableTilesCount : totalTiles}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => soundFX.toggle()}
                  title={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
                  aria-label={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
                  className={`min-h-[44px] sm:min-h-[40px] min-w-[44px] sm:min-w-0 px-3 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer border ${
                    soundEnabled
                      ? 'bg-[#EAF2EE] border-[#14543D]/20 text-[#14543D] hover:bg-[#DDECE4]'
                      : 'bg-[#F7F8F1] border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C]'
                  }`}
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                      <span className="hidden sm:inline">الأصوات مفعّلة</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                      <span className="hidden sm:inline">الأصوات مكتومة</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowMobileBoardMenu((prev) => !prev)}
                  aria-expanded={showMobileBoardMenu}
                  data-testid="mobile-board-options-toggle"
                  className={`md:hidden min-h-[44px] px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer ${
                    showMobileBoardMenu
                      ? 'bg-[#14543D] border-[#14543D] text-white'
                      : 'bg-[#F7F8F1] border-[#E5E8DD] text-[#1B1F1C]'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                  <span>خيارات</span>
                </button>
              </div>

              <div
                className={`${
                  showMobileBoardMenu
                    ? 'order-last w-full grid grid-cols-3 gap-1.5 pt-1 md:order-none md:w-auto md:flex md:pt-0'
                    : 'hidden md:flex items-center gap-2'
                }`}
              >
                {isGameLocked ? (
                  <>
                    <button
                      type="button"
                      onClick={onGoToCategories}
                      title="عرض فئات الجولة الـ 6 المختارة (مقفلة للقراءة فقط)"
                      className="min-h-[44px] md:min-h-[40px] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-[#52574E] bg-[#F7F8F1] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
                      <span className="truncate">الفئات</span>
                    </button>

                    <button
                      type="button"
                      onClick={onGoToSetup}
                      title="عرض بيانات الفرق (مقفلة للقراءة فقط)"
                      className="min-h-[44px] md:min-h-[40px] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-[#52574E] bg-[#F7F8F1] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#14543D] shrink-0" />
                      <span className="truncate">الفرق</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onGoToCategories}
                      className="min-h-[44px] md:min-h-[40px] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-[#1B1F1C] bg-[#F7F8F1] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
                      <span className="truncate">تغيير الفئات</span>
                    </button>

                    <button
                      type="button"
                      onClick={onGoToSetup}
                      className="min-h-[44px] md:min-h-[40px] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-[#1B1F1C] bg-[#F7F8F1] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-[#14543D] shrink-0" />
                      <span className="truncate">تعديل الفرق</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPinnedTileQuestions({});
                    setActiveSelection(null);
                    setShowMobileBoardMenu(false);
                    onResetBoard();
                  }}
                  className="min-h-[44px] md:min-h-[40px] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-[#52574E] hover:text-[#1B1F1C] bg-[#F7F8F1] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">تصفير اللوحة</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onFinishGame}
                className="min-h-[44px] sm:min-h-[40px] px-3.5 sm:px-4 py-1.5 text-xs font-bold text-white bg-[#1B1F1C] hover:bg-[#2F3530] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
              >
                <Trophy className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
                <span>إنهاء الجولة والنتائج</span>
              </button>
            </div>
          </div>

          {/* Teams Score Cards */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              teams.length === 3
                ? 'lg:grid-cols-3'
                : teams.length >= 4
                ? 'lg:grid-cols-4'
                : 'lg:grid-cols-2'
            } gap-2.5 sm:gap-3.5`}
          >
            {teams.map((team, idx) => {
              const isCurrent = idx === safeTeamIndex;
              const displayTeamName = team.name?.trim() || `الفريق ${idx + 1}`;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => onSelectTurn(idx)}
                  title="اضغط لتحديد الدور على هذا الفريق"
                  className={`relative overflow-hidden text-right p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-center justify-between gap-2 sm:gap-3 cursor-pointer active:scale-[0.99] ${
                    teams.length === 3 && idx === 2 ? 'sm:col-span-2 lg:col-span-1' : ''
                  } ${
                    isCurrent
                      ? 'bg-[#FFFDF9] shadow-md'
                      : 'bg-[#F7F8F1]/80 border-[#E5E8DD] opacity-85 hover:opacity-100 hover:bg-[#FFFFFF]'
                  }`}
                  style={{
                    borderColor: isCurrent ? team.color : '#E5E8DD',
                  }}
                >
                  {/* Top Color Accent Strip */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-1"
                    style={{
                      backgroundColor: isCurrent ? team.color : 'transparent',
                    }}
                  />

                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="font-display text-sm sm:text-base font-bold text-[#1B1F1C] truncate">
                        {displayTeamName}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] sm:text-[11px] font-bold text-[#F07842] bg-[#FEF2EC] px-2 py-0.5 rounded-md shrink-0">
                          دوركم الآن
                        </span>
                      )}
                    </div>
                    {team.players.length > 0 && (
                      <div className="text-[11px] sm:text-xs text-[#52574E] truncate">
                        {team.players.join(' · ')}
                      </div>
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
                    <div className="text-[10px] sm:text-[11px] font-medium text-[#52574E] mt-1">
                      نقطة
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Notice if database has 0 questions */}
        {approvedQuestions.length === 0 && (
          <div className="bg-[#FFFFFF] border-2 border-[#F07842] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold text-[#1B1F1C]">
                لا توجد أسئلة معتمدة في قاعدة البيانات حالياً
              </h2>
              <p className="text-xs text-[#52574E]">
                لتفعيل خانات اللوحة، قم بتعبئة الحزمة التأسيسية المعتمدة في Firestore أو أضف أسئلتك من لوحة المشرف.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={onSeedQuestions}
                disabled={seeding}
                className="px-5 py-2.5 text-xs font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {seeding ? 'جاري التعبئة...' : 'تعبئة الحزمة التأسيسية في Firestore'}
                </span>
              </button>
            )}
          </div>
        )}

        {/* Exhaustion Notice Banner if all new questions in one or more categories were already seen */}
        {(exhaustionAlert ||
          (exhaustedColumnNames.length > 0 &&
            !questionDedupSettings?.allowRepeatAfterExhaustion)) && (
          <div
            role="status"
            className="bg-[#FEF2EC] border border-[#F07842]/35 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2 text-[#1B1F1C] font-semibold">
              <ShieldAlert className="w-4 h-4 text-[#F07842] shrink-0" />
              <span>
                {exhaustionAlert ||
                  `خلصت الأسئلة الجديدة في هذي الفئة: ${exhaustedColumnNames.join('، ')} — لن يتم تكرار الأسئلة التي شاهدتها سابقاً.`}
              </span>
            </div>
            <button
              type="button"
              onClick={onGoToCategories}
              className="px-3.5 py-1.5 rounded-xl bg-[#1B1F1C] hover:bg-[#2F3530] text-white font-bold cursor-pointer"
            >
              تغيير الفئات
            </button>
          </div>
        )}

        {/* 2. DYNAMIC SUBCATEGORIES GAME BOARD (Responsive across Mobile, Tablet, Laptop & Large TV) */}
        {boardColumns.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-12 text-center space-y-4">
            <p className="font-display text-lg font-bold text-[#1B1F1C]">
              لم يتم اختيار أي فئات فرعية للوحة اللعب بعد
            </p>
            <button
              type="button"
              onClick={onGoToCategories}
              className="px-6 py-3 text-xs font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl cursor-pointer"
            >
              اختر الفئات الفرعية الآن
            </button>
          </div>
        ) : (
          <section
            aria-label="لوحة الأسئلة حسب الفئات الفرعية المختارة"
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-3 sm:p-5 lg:p-6 shadow-xs space-y-4"
          >
            {/* MOBILE 2-COLUMN BOARD (Zero horizontal scrolling on phones) */}
            <div className="grid grid-cols-2 gap-3 md:hidden" data-testid="mobile-game-board">
              {boardColumns.map((col) => {
                const isColExhausted = exhaustedSubKeySet.has(
                  col.subId || col.subName
                );
                const isWkColumn = isWalaKalimaCategory({
                  subcategoryId: col.subId,
                  subcategoryName: col.subName,
                  mainCategoryName: col.mainCategoryName,
                });
                return (
                  <div
                    key={`mobile_${col.subId || col.subName}`}
                    className="flex flex-col gap-2 min-w-0"
                  >
                    {/* Subcategory Card Header */}
                    <div
                      className="relative overflow-hidden rounded-2xl px-2.5 py-3 text-center border flex flex-col items-center justify-between gap-1.5 min-h-[100px]"
                      style={{
                        backgroundColor: col.bgTint,
                        borderColor: col.borderTint,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-1"
                        style={{
                          backgroundColor: isWkColumn ? '#F07842' : col.accentColor,
                        }}
                      />
                      <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#14543D] max-w-full pt-0.5">
                        <CategoryIcon
                          iconName={col.iconName}
                          color={col.accentColor}
                          className="w-3.5 h-3.5 shrink-0"
                        />
                        <span className="leading-tight truncate">{col.mainCategoryName}</span>
                      </div>

                      <h2 className="font-display text-sm font-bold text-[#1B1F1C] leading-snug line-clamp-2 text-center">
                        {col.subName}
                      </h2>

                      {isColExhausted && !questionDedupSettings?.allowRepeatAfterExhaustion ? (
                        <div className="text-[10px] font-bold text-[#F07842] leading-tight">
                          خلصت الأسئلة الجديدة
                        </div>
                      ) : isWkColumn ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FEF2EC] border border-[#F07842]/30 text-[10px] font-bold text-[#D9602B]">
                          تمثيل صامت · QR
                        </div>
                      ) : (
                        col.teamName && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFFFFF]/90 border border-[#E5E8DD] text-[10px] font-bold text-[#1B1F1C] max-w-full">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: col.teamColor || '#14543D',
                              }}
                            />
                            <span className="truncate">{col.teamName}</span>
                          </div>
                        )
                      )}
                    </div>

                    {/* 5 Point Tiles (100 to 500) with >=44px touch height */}
                    <div className="flex flex-col gap-1.5">
                      {POINT_TIERS.map((pts) => {
                        const tileKey = `${col.subName}__${pts}`;
                        const isUsed = usedTileKeys.includes(tileKey);
                        const isActiveSelected =
                          activeSelection?.tileKey === tileKey ||
                          activeWalaKalimaTile?.tileKey === tileKey;
                        const slot =
                          isUsed || isWkColumn
                            ? null
                            : getSlotSelection(col.subName, pts, col.subId);
                        const availableQ = isWkColumn ? true : Boolean(slot?.question);
                        const isTileExhausted = Boolean(
                          !isWkColumn && slot && !slot.question && slot.isExhausted
                        );
                        const isDisabled = isUsed || !availableQ;

                        return (
                          <button
                            key={`mobile_${pts}`}
                            type="button"
                            disabled={isDisabled}
                            onClick={() =>
                              handleTileClick(
                                col.subName,
                                col.mainCategoryName,
                                pts,
                                col.subId
                              )
                            }
                            aria-label={
                              isUsed
                                ? `${col.subName} ${pts} نقطة - تم استخدامه`
                                : isTileExhausted
                                ? `${col.subName} ${pts} نقطة - خلصت الأسئلة الجديدة في هذي الفئة`
                                : !availableQ
                                ? `${col.subName} ${pts} نقطة - غير متوفر`
                                : `${col.subName} ${pts} نقطة`
                            }
                            className={`min-h-[46px] h-12 rounded-xl font-mono tabular-nums text-base font-extrabold border transition-all flex items-center justify-center gap-1.5 ${
                              isUsed
                                ? 'bg-[#F3F5E9]/65 border-[#E5E8DD]/70 text-[#666B62]/50 cursor-not-allowed'
                                : isActiveSelected
                                ? 'bg-[#FEF2EC] border-[#F07842] text-[#D9602B] ring-2 ring-[#F07842]/30 shadow-sm cursor-pointer'
                                : !availableQ
                                ? 'bg-[#F7F8F1]/60 border-dashed border-[#E5E8DD] text-[#666B62]/75 cursor-not-allowed text-[11px] font-sans'
                                : 'bg-[#F7F8F1] hover:bg-[#F07842] text-[#1B1F1C] hover:text-white border-[#E5E8DD] hover:border-[#F07842] shadow-2xs cursor-pointer active:scale-[0.98]'
                            }`}
                          >
                            {isUsed ? (
                              <>
                                <Check className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                <span className="line-through text-sm">{pts}</span>
                              </>
                            ) : isTileExhausted ? (
                              <span className="text-[10px] font-sans font-bold text-[#F07842] px-1 text-center leading-tight">
                                خلصت الجديدة
                              </span>
                            ) : !availableQ ? (
                              <span className="text-[10px] font-sans font-normal">
                                غير متوفر
                              </span>
                            ) : (
                              <span>{pts}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP & TABLET MULTI-COLUMN BOARD */}
            <div className="hidden md:block space-y-3" data-testid="desktop-game-board">
              {boardColumns.length > 4 && (
                <div className="flex items-center justify-between text-xs text-[#52574E] pb-1">
                  <span>
                    استعراض الفئات المختارة ({boardColumns.length} فئات)
                  </span>
                  <span className="font-mono tabular-nums">100 — 500 نقطة</span>
                </div>
              )}

              <div className="overflow-x-auto pb-1">
                <div className="flex items-stretch gap-3 w-full min-w-max">
                  {boardColumns.map((col) => {
                    const isColExhausted = exhaustedSubKeySet.has(
                      col.subId || col.subName
                    );
                    const isWkColumn = isWalaKalimaCategory({
                      subcategoryId: col.subId,
                      subcategoryName: col.subName,
                      mainCategoryName: col.mainCategoryName,
                    });
                    return (
                      <div
                        key={col.subId || col.subName}
                        className="w-[168px] sm:w-[186px] flex-1 min-w-[158px] sm:min-w-[172px] flex flex-col gap-2.5"
                      >
                        {/* Subcategory Column Header */}
                        <div
                          className="relative overflow-hidden rounded-2xl p-3.5 text-center border flex flex-col items-center justify-between gap-2 min-h-[122px]"
                          style={{
                            backgroundColor: col.bgTint,
                            borderColor: col.borderTint,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-x-0 top-0 h-1"
                            style={{
                              backgroundColor: isWkColumn ? '#F07842' : col.accentColor,
                            }}
                          />

                          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#14543D] pt-0.5">
                            <CategoryIcon
                              iconName={col.iconName}
                              color={col.accentColor}
                              className="w-3.5 h-3.5 shrink-0"
                            />
                            <span className="leading-tight">
                              {col.mainCategoryName}
                            </span>
                          </div>

                          <h2 className="font-display text-sm sm:text-base font-bold text-[#1B1F1C] leading-snug line-clamp-2 text-center">
                            {col.subName}
                          </h2>

                          {isColExhausted && !questionDedupSettings?.allowRepeatAfterExhaustion ? (
                            <div className="text-[10px] font-bold text-[#F07842] leading-tight">
                              خلصت الأسئلة الجديدة في هذي الفئة
                            </div>
                          ) : isWkColumn ? (
                            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#FEF2EC] border border-[#F07842]/30 text-[10px] font-bold text-[#D9602B]">
                              تمثيل صامت · QR
                            </div>
                          ) : (
                            col.teamName && (
                              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#FFFFFF]/90 border border-[#E5E8DD] text-[10px] font-bold text-[#1B1F1C] max-w-full">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: col.teamColor || '#14543D',
                                  }}
                                />
                                <span className="truncate max-w-[105px]">
                                  {col.teamName}
                                </span>
                              </div>
                            )
                          )}
                        </div>

                        {/* 5 Point Tiles (100 to 500) */}
                        {POINT_TIERS.map((pts) => {
                          const tileKey = `${col.subName}__${pts}`;
                          const isUsed = usedTileKeys.includes(tileKey);
                          const isActiveSelected =
                            activeSelection?.tileKey === tileKey ||
                            activeWalaKalimaTile?.tileKey === tileKey;
                          const slot =
                            isUsed || isWkColumn
                              ? null
                              : getSlotSelection(col.subName, pts, col.subId);
                          const availableQ = isWkColumn ? true : Boolean(slot?.question);
                          const isTileExhausted = Boolean(
                            !isWkColumn && slot && !slot.question && slot.isExhausted
                          );
                          const isDisabled = isUsed || !availableQ;

                          return (
                            <button
                              key={pts}
                              type="button"
                              disabled={isDisabled}
                              onClick={() =>
                                handleTileClick(
                                  col.subName,
                                  col.mainCategoryName,
                                  pts,
                                  col.subId
                                )
                              }
                              title={
                                isTileExhausted
                                  ? 'خلصت الأسئلة الجديدة في هذي الفئة'
                                  : undefined
                              }
                              aria-label={
                                isUsed
                                  ? `${col.subName} ${pts} نقطة - تم استخدامه`
                                  : isTileExhausted
                                  ? `${col.subName} ${pts} نقطة - خلصت الأسئلة الجديدة في هذي الفئة`
                                  : !availableQ
                                  ? `${col.subName} ${pts} نقطة - غير متوفر`
                                  : `${col.subName} ${pts} نقطة`
                              }
                              className={`h-16 md:h-20 rounded-2xl font-mono tabular-nums text-xl md:text-2xl font-extrabold border transition-all duration-150 flex flex-col items-center justify-center ${
                                isUsed
                                  ? 'bg-[#F3F5E9]/65 border-[#E5E8DD]/70 text-[#666B62]/50 cursor-not-allowed'
                                  : isActiveSelected
                                  ? 'bg-[#FEF2EC] border-[#F07842] text-[#D9602B] ring-2 ring-[#F07842]/30 shadow-sm cursor-pointer'
                                  : !availableQ
                                  ? 'bg-[#F7F8F1]/60 border-dashed border-[#E5E8DD] text-[#666B62]/75 cursor-not-allowed text-xs font-sans'
                                  : 'bg-[#F7F8F1] hover:bg-[#F07842] text-[#1B1F1C] hover:text-white border-[#E5E8DD] hover:border-[#F07842] hover:-translate-y-0.5 hover:shadow-md cursor-pointer active:translate-y-0 active:scale-[0.98]'
                              }`}
                            >
                              {isUsed ? (
                                <div className="flex flex-col items-center leading-none gap-1">
                                  <span className="line-through text-base md:text-xl">
                                    {pts}
                                  </span>
                                  <span className="text-[10px] font-sans font-semibold no-underline inline-flex items-center gap-0.5">
                                    <Check className="w-3 h-3" />
                                    مُستخدم
                                  </span>
                                </div>
                              ) : isTileExhausted ? (
                                <span className="text-[10px] font-sans font-bold text-[#F07842] px-1 text-center leading-tight">
                                  خلصت الأسئلة الجديدة
                                </span>
                              ) : !availableQ ? (
                                <span className="text-[11px] font-sans font-normal">
                                  غير متوفر
                                </span>
                              ) : (
                                <span>{pts}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3. ACTIVE QUESTION STAGE MODAL */}
        {activeSelection && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#1B1F1C]/75 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="active-question-heading"
          >
            <motion.div
              {...getQuestionCardFeedbackAnimation(feedbackBanner?.type, effects)}
              className={`relative w-full max-w-3xl max-h-[94dvh] flex flex-col bg-[#FFFFFF] border rounded-3xl overflow-hidden shadow-2xl transition-colors duration-200 ${
                feedbackBanner?.type === 'correct' && effects.correct
                  ? 'border-emerald-500 ring-4 ring-emerald-500/30'
                  : feedbackBanner?.type === 'wrong' && effects.wrong
                  ? 'border-rose-500 ring-4 ring-rose-500/25'
                  : 'border-[#E5E8DD]'
              }`}
            >
              <AnswerFeedbackFlash
                type={feedbackBanner?.type ?? null}
                effects={effects}
              />

              {/* Dark Charcoal Arena Modal Header */}
              <div className="bg-[#1B1F1C] text-white px-3.5 sm:px-6 py-2.5 sm:py-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                  <span className="hidden sm:inline text-xs text-white/65">
                    {activeSelection.mainCategoryName} /
                  </span>
                  <span className="font-display text-xs sm:text-base font-bold text-white truncate max-w-[160px] sm:max-w-none">
                    {activeSelection.subcategoryName}
                  </span>
                  <span className="text-white/40" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-white bg-[#F07842] px-2 sm:px-2.5 py-0.5 rounded-lg shadow-2xs">
                    {activeSelection.points} نقطة
                  </span>
                  <span className="text-[11px] sm:text-xs text-white/75 flex items-center gap-1">
                    {activeMediaType === 'audio' ? (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-[#F07842]" />
                        <span>({activeSelection.question.difficulty} · صوتي)</span>
                      </>
                    ) : activeMediaType === 'image' ? (
                      <>
                        <ImageIcon className="w-3.5 h-3.5 text-[#F07842]" />
                        <span>({activeSelection.question.difficulty} · صورة)</span>
                      </>
                    ) : (
                      <span>({activeSelection.question.difficulty})</span>
                    )}
                  </span>
                </div>

                {/* Countdown Timer Controls */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-mono tabular-nums text-xs sm:text-sm font-bold transition-colors ${
                      timeLeft === 0
                        ? 'bg-rose-600 text-white'
                        : timeLeft <= 10
                        ? 'bg-[#F07842] text-white'
                        : 'bg-white/12 text-white'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>
                      {timeLeft === 0 ? 'انتهى (0ث)' : `${timeLeft}ث`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTimerPaused((p) => !p)}
                    className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] p-2 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                    aria-label={timerPaused ? 'استئناف المؤقت' : 'إيقاف مؤقت'}
                    title={timerPaused ? 'استئناف المؤقت' : 'إيقاف مؤقت'}
                  >
                    {timerPaused ? (
                      <Play className="w-4 h-4" />
                    ) : (
                      <Pause className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTimeLeft(timerDuration);
                      setTimerPaused(false);
                    }}
                    className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] p-2 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                    aria-label="إعادة ضبط المؤقت"
                    title="إعادة ضبط المؤقت"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Remaining Time Visual Progress Track */}
              <div
                aria-hidden="true"
                className="h-1.5 w-full bg-[#E5E8DD] overflow-hidden shrink-0"
              >
                <div
                  className={`h-full transition-all duration-500 ease-linear ${
                    timeLeft === 0
                      ? 'bg-rose-600'
                      : timeLeft <= 10
                      ? 'bg-[#F07842]'
                      : 'bg-[#14543D]'
                  }`}
                  style={{ width: `${timerRatio}%` }}
                />
              </div>

              {/* Active Team Banner */}
              <div className="bg-[#F7F8F1] border-b border-[#E5E8DD] px-3.5 sm:px-6 py-2 flex items-center justify-between gap-2 text-xs shrink-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                  <span className="text-[#52574E]">السؤال موجه إلى:</span>
                  <span
                    className="inline-flex items-center gap-1.5 font-bold truncate"
                    style={{ color: activeTeam?.color || '#14543D' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: activeTeam?.color || '#14543D' }}
                    />
                    <span className="truncate">
                      {activeTeam?.name?.trim() || `الفريق ${safeTeamIndex + 1}`}
                    </span>
                  </span>
                  {timeLeft === 0 && !answerRevealed && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 font-bold text-[11px]">
                      انتهى وقت الإجابة
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!!feedbackBanner}
                  onClick={handleCloseModalWithoutScoring}
                  className="min-h-[44px] sm:min-h-[36px] px-3 text-[#52574E] hover:text-[#1B1F1C] disabled:opacity-40 font-semibold cursor-pointer shrink-0 transition-colors"
                >
                  إغلاق بدون احتساب
                </button>
              </div>

              {/* Scrollable Question Body */}
              <div className="p-3.5 sm:p-6 md:p-8 space-y-3.5 sm:space-y-5 overflow-y-auto flex-1">
                {activeSelection.isRepeatedFallback && (
                  <div className="bg-[#FEF2EC] border border-[#F07842]/30 rounded-xl px-4 py-2.5 text-xs font-semibold text-[#1B1F1C]">
                    خلصت الأسئلة الجديدة في هذي الفئة — تم عرض سؤال سابق تلقائياً حسب إعدادات المنصة.
                  </div>
                )}

                <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-2xl p-4 sm:p-8 text-center">
                  <h3
                    id="active-question-heading"
                    className="font-display text-base sm:text-xl md:text-2xl font-bold text-[#1B1F1C] leading-relaxed"
                  >
                    {activeSelection.question.questionText}
                  </h3>
                </div>

                {/* Optional Question Image Display — Preserves aspect ratio & responsive across mobile, desktop, and TV */}
                {activeMediaType === 'image' && activeSelection.question.imageUrl && (
                  imageLoadFailed ? (
                    <div className="bg-[#F7F8F1] border border-rose-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-right space-y-1">
                        <div className="text-xs sm:text-sm font-bold text-rose-800">
                          تعذر تحميل صورة السؤال
                        </div>
                        <p className="text-[11px] text-rose-700/90">
                          تحقق من اتصال الإنترنت ثم اضغط على «إعادة المحاولة».
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setImageLoadFailed(false);
                          setImageRetryNonce((n) => n + 1);
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>إعادة المحاولة</span>
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-2xl p-2.5 sm:p-4 flex flex-col items-center gap-2">
                      <div className="relative w-full flex items-center justify-center">
                        <img
                          key={`${activeSelection.question.imageUrl}_${imageRetryNonce}`}
                          src={activeSelection.question.imageUrl}
                          referrerPolicy="no-referrer"
                          alt={
                            activeSelection.question.imageDescription ||
                            'صورة السؤال'
                          }
                          onError={() => setImageLoadFailed(true)}
                          onClick={() =>
                            setZoomedImageUrl(
                              activeSelection.question.imageUrl || null
                            )
                          }
                          className="max-h-[175px] sm:max-h-[270px] md:max-h-[320px] xl:max-h-[360px] w-auto max-w-full object-contain rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] shadow-xs cursor-zoom-in"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setZoomedImageUrl(
                              activeSelection.question.imageUrl || null
                            )
                          }
                          className="absolute bottom-2 left-2 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1B1F1C]/85 hover:bg-[#1B1F1C] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          title="تكبير الصورة"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>تكبير</span>
                        </button>
                      </div>

                      {activeSelection.question.imageDescription && (
                        <p className="text-xs text-[#52574E] text-center leading-relaxed">
                          {activeSelection.question.imageDescription}
                        </p>
                      )}
                    </div>
                  )
                )}

                {/* Question Audio Player (for Audio Questions) */}
                {activeMediaType === 'audio' && activeSelection.question.audioUrl && (
                  <QuestionAudioPlayer
                    audioUrl={activeSelection.question.audioUrl}
                    maxPlays={activeSelection.question.audioMaxPlays ?? null}
                    initialPlaysUsed={audioPlaysUsed}
                    onPlaysUsedChange={setAudioPlaysUsed}
                    onReadyChange={setMediaAudioReady}
                    questionKey={`${activeSelection.tileKey}_${activeSelection.question.id}`}
                  />
                )}

                {/* ANSWER & JUDGMENT CONTROLS */}
                {!answerRevealed ? (
                  <div className="pt-1 sm:pt-2 flex flex-col items-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playAnswerReveal();
                        setAnswerRevealed(true);
                      }}
                      className="w-full sm:w-auto min-h-[52px] px-7 sm:px-9 py-3.5 text-sm sm:text-base font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-white" />
                      <span>إظهار الإجابة</span>
                    </button>
                    <span className="text-[11px] text-[#52574E] text-center">
                      اضغط على «إظهار الإجابة» بعد استماعك لإجابة الفريق لاحتساب النقاط
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4 sm:space-y-5">
                    <div className="bg-[#EAF2EE] border border-[#14543D]/30 rounded-2xl p-4 sm:p-5 space-y-2 text-center sm:text-right">
                      <div className="text-xs font-bold text-[#14543D]">
                        الإجابة الصحيحة المعتمدة:
                      </div>
                      <div className="font-display text-lg sm:text-xl md:text-2xl font-bold text-[#1B1F1C]">
                        {activeSelection.question.correctAnswer}
                      </div>
                      {activeSelection.question.explanation && (
                        <p className="text-xs text-[#52574E] leading-relaxed pt-1">
                          {activeSelection.question.explanation}
                        </p>
                      )}
                      {activeSelection.question.source && (
                        <div className="text-[11px] text-[#52574E]">
                          المصدر: {activeSelection.question.source}
                        </div>
                      )}
                    </div>

                    {/* Feedback Banner on Judgment */}
                    {feedbackBanner && (
                      <AnswerFeedbackBanner
                        type={feedbackBanner.type}
                        headline={
                          feedbackBanner.type === 'correct'
                            ? 'إجابة صحيحة!'
                            : 'إجابة خاطئة'
                        }
                        detailText={feedbackBanner.text}
                        effectKey={`${activeSelection.tileKey}_${feedbackBanner.type}`}
                        effects={effects}
                      />
                    )}

                    {/* Unified Winner Selection Panel (Shown only AFTER answer is revealed) */}
                    <div className="pt-2 border-t border-[#E5E8DD]">
                      <WhoAnsweredCorrectlyPanel
                        teams={teams}
                        points={activeSelection.points}
                        disabled={Boolean(feedbackBanner)}
                        pendingChoice={pendingJudgmentChoice}
                        onSelectTeam={handleSelectWinnerTeam}
                        onSelectNoTeam={handleNoTeamAnswered}
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* 4. FULLSCREEN IMAGE LIGHTBOX MODAL (Does not reveal answer) */}
        {zoomedImageUrl && activeSelection && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-[#1B1F1C]/92 backdrop-blur-xs"
            onClick={() => setZoomedImageUrl(null)}
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
                onClick={() => setZoomedImageUrl(null)}
                className="self-end min-h-[44px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>إغلاق التكبير</span>
              </button>
              <img
                src={zoomedImageUrl}
                alt={
                  activeSelection.question.imageDescription || 'صورة السؤال مكبرة'
                }
                className="max-h-[82dvh] max-w-[94vw] w-auto object-contain rounded-2xl border border-white/20 bg-[#FFFFFF] p-2 shadow-2xl"
              />
              {activeSelection.question.imageDescription && (
                <p className="text-xs sm:text-sm text-white/90 text-center max-w-2xl">
                  {activeSelection.question.imageDescription}
                </p>
              )}
            </div>
          </div>
        )}
      {/* 5. WALA KALIMA INTERACTIVE QR MODAL (Secret word strictly stays on player phone) */}
      {activeWalaKalimaTile && activeTeam && (
        <WalaKalimaBoardModal
          matchId={matchId}
          tileKey={activeWalaKalimaTile.tileKey}
          subcategoryId={activeWalaKalimaTile.subcategoryId}
          subcategoryName={activeWalaKalimaTile.subcategoryName}
          initialPoints={activeWalaKalimaTile.points}
          preferredDifficulty={POINT_TO_DIFFICULTY[activeWalaKalimaTile.points]}
          activeTeam={{
            id: activeTeam.id,
            name: activeTeam.name || `الفريق ${safeTeamIndex + 1}`,
            color: activeTeam.color,
            players: activeTeam.players,
          }}
          teams={teams}
          canControl={true}
          settings={walaKalimaSettings}
          onCommitResult={({ awardedTeamIndex, earnedPoints, tileKey, sessionId }) => {
            if (awardedTeamIndex !== null && earnedPoints > 0) {
              soundFX.playCorrect();
              onAwardPoints(
                awardedTeamIndex,
                earnedPoints,
                tileKey,
                sessionId,
                playableTilesCount
              );
            } else {
              onMarkTileUsedNoPoints(tileKey, sessionId, playableTilesCount);
            }
            setActiveWalaKalimaTile(null);
          }}
          onCancel={() => {
            setActiveWalaKalimaTile(null);
          }}
        />
      )}
      </div>
    </MotionConfig>
  );
};
