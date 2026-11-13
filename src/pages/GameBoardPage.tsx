import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Clock,
  Eye,
  CheckCircle2,
  XCircle,
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
} from 'lucide-react';
import {
  MainCategoryMeta,
  PointValue,
  SubcategoryItem,
  TeamConfig,
  TriviaQuestion,
} from '../types/game';
import { MAIN_CATEGORIES } from '../data/categoriesAndSeed';
import { CategoryIcon } from '../components/CategoryIcon';
import { matchesSubcategoryQuestion } from '../services/questionService';
import { soundFX } from '../services/soundEffects';

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
}

export const GameBoardPage: React.FC<GameBoardPageProps> = ({
  teams,
  mainCategories = MAIN_CATEGORIES,
  orderedTeamSelections = [],
  selectedSubcategories,
  subcategories,
  activeTeamIndex,
  usedTileKeys,
  roundUsedQuestionIds = [],
  usedQuestionIds,
  timerDuration,
  approvedQuestions,
  isGameLocked = false,
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
}) => {
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

  useEffect(() => {
    setZoomedImageUrl(null);
    setImageLoadFailed(false);
  }, [activeSelection?.question?.id, activeSelection?.question?.imageUrl]);

  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'correct' | 'wrong';
    text: string;
  } | null>(null);

  const isSubmittingRef = useRef(false);
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
        onActiveQuestionChange?.(null);
      } else {
        localStorage.setItem(
          ACTIVE_MODAL_STORAGE_KEY,
          JSON.stringify({
            activeSelection,
            answerRevealed,
            timeLeft,
            timerPaused,
          })
        );
        onActiveQuestionChange?.({
          tileKey: activeSelection.tileKey,
          subcategoryId: activeSelection.subcategoryId,
          subcategoryName: activeSelection.subcategoryName,
          mainCategoryName: activeSelection.mainCategoryName,
          points: activeSelection.points,
          questionId: activeSelection.question.id,
          questionText: activeSelection.question.questionText,
          correctAnswer: activeSelection.question.correctAnswer,
          imageUrl: activeSelection.question.imageUrl,
          imageDescription: activeSelection.question.imageDescription,
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
    onActiveQuestionChange,
  ]);

  // If the currently open tile was already marked used (e.g. from another tab/action), close modal
  useEffect(() => {
    if (activeSelection && usedTileKeys.includes(activeSelection.tileKey)) {
      setActiveSelection(null);
      setFeedbackBanner(null);
      isSubmittingRef.current = false;
    }
  }, [activeSelection, usedTileKeys]);

  // Countdown timer effect
  useEffect(() => {
    if (!activeSelection || timerPaused || answerRevealed || feedbackBanner) {
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
  }, [activeSelection, timerPaused, answerRevealed, feedbackBanner, timeLeft]);

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

  // Find an available approved question for a subcategory + point tier without repeating questions in the same round
  const getQuestionForSlot = (
    subcategoryName: string,
    points: PointValue,
    subcategoryId?: string
  ): TriviaQuestion | null => {
    const tileKey = `${subcategoryName}__${points}`;

    let matching = (subcategoryId && questionsBySlotMap.get(`${subcategoryId}__${points}`)) ||
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
    if (!matching || matching.length === 0) return null;

    // 1. If a question was already pinned to this tile in this round and hasn't been used by another tile, return it
    const pinnedId = pinnedTileQuestions[tileKey];
    if (pinnedId) {
      const pinnedQ = matching.find((q) => q.id === pinnedId);
      if (pinnedQ && !roundUsedQuestionIds.includes(pinnedQ.id)) {
        return pinnedQ;
      }
    }

    // 2. Exclude any question already used in the CURRENT round (strict no-repeat within the same round)
    // Also exclude questions already pinned to other tiles on the board
    const pinnedByOtherTiles = new Set(
      Object.entries(pinnedTileQuestions)
        .filter(([k]) => k !== tileKey)
        .map(([, v]) => v)
    );

    const availableForThisRound = matching.filter(
      (q) =>
        !roundUsedQuestionIds.includes(q.id) && !pinnedByOtherTiles.has(q.id)
    );

    if (availableForThisRound.length === 0) {
      // Fallback if all were pinned by other tiles: any not used in this round
      const notUsedInRound = matching.filter(
        (q) => !roundUsedQuestionIds.includes(q.id)
      );
      if (notUsedInRound.length === 0) return null;
      return notUsedInRound[0];
    }

    // 3. Prefer questions not used in previous rounds of the session either
    const freshAcrossSession = availableForThisRound.filter(
      (q) => !usedQuestionIds.includes(q.id)
    );
    if (freshAcrossSession.length > 0) {
      return freshAcrossSession[0];
    }

    // 4. If all matching questions were used in earlier rounds, cycle cleanly for this new round
    return availableForThisRound[0];
  };

  // Count how many tiles on this board are actually playable (either already used in this round or have an available question)
  const playableTilesCount = useMemo(() => {
    let count = 0;
    for (const col of boardColumns) {
      for (const pts of POINT_TIERS) {
        const tileKey = `${col.subName}__${pts}`;
        if (usedTileKeys.includes(tileKey)) {
          count++;
        } else if (getQuestionForSlot(col.subName, pts, col.subId)) {
          count++;
        }
      }
    }
    return count;
  }, [
    boardColumns,
    usedTileKeys,
    approvedQuestions,
    roundUsedQuestionIds,
    usedQuestionIds,
    pinnedTileQuestions,
  ]);

  const handleTileClick = (
    subcategoryName: string,
    mainCategoryName: string,
    points: PointValue,
    subcategoryId?: string
  ) => {
    const tileKey = `${subcategoryName}__${points}`;
    if (usedTileKeys.includes(tileKey)) return;

    const q = getQuestionForSlot(subcategoryName, points, subcategoryId);
    if (!q) return;

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
    });
    setAnswerRevealed(false);
    setTimeLeft(timerDuration);
    prevTimeLeftRef.current = timerDuration;
    setTimerPaused(false);
    setFeedbackBanner(null);
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

  const handleCorrectAnswer = () => {
    if (!activeSelection || feedbackBanner || isSubmittingRef.current) return;
    if (usedTileKeys.includes(activeSelection.tileKey)) return;

    isSubmittingRef.current = true;
    const capturedSelection = activeSelection;
    const capturedTeamIndex = safeTeamIndex;
    const currentTeam = teams[capturedTeamIndex];

    soundFX.playCorrect();
    setFeedbackBanner({
      type: 'correct',
      text: `صح عليكم يا ${currentTeam?.name || 'أبطال'}! كسبتوا +${capturedSelection.points} نقطة!`,
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
      isSubmittingRef.current = false;
      judgmentTimeoutRef.current = null;
    }, 850);
  };

  const handleWrongAnswer = () => {
    if (!activeSelection || feedbackBanner || isSubmittingRef.current) return;
    if (usedTileKeys.includes(activeSelection.tileKey)) return;

    isSubmittingRef.current = true;
    const capturedSelection = activeSelection;

    soundFX.playWrong();
    setFeedbackBanner({
      type: 'wrong',
      text: 'إجابتكم غلط! راحت النقاط وينتقل الدور للفريق اللي بعده.',
    });

    judgmentTimeoutRef.current = window.setTimeout(() => {
      onMarkTileUsedNoPoints(
        capturedSelection.tileKey,
        capturedSelection.question.id,
        playableTilesCount
      );
      setActiveSelection(null);
      setFeedbackBanner(null);
      isSubmittingRef.current = false;
      judgmentTimeoutRef.current = null;
    }, 850);
  };

  const handleCloseModalWithoutScoring = () => {
    if (feedbackBanner || isSubmittingRef.current) return;
    setActiveSelection(null);
    setFeedbackBanner(null);
  };

  return (
    <div className="max-w-[1420px] mx-auto px-4 sm:px-6 py-6 md:py-8 space-y-6">
      {/* 1. PERSISTENT SCOREBOARD BAR */}
      <section
        aria-label="لوحة النتائج والفرق"
        className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 md:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E8DD] pb-3.5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#14543D]">
              الدور الحين على:
            </span>
            {activeTeam && (
              <span
                className="px-3.5 py-1 rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: activeTeam.color }}
              >
                {activeTeam.name || `الفريق ${safeTeamIndex + 1}`}
              </span>
            )}
            <span className="text-xs text-[#777B73] hidden sm:inline">
              · اختر الفئة الفرعية والنقاط من اللوحة تحت
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#777B73] font-mono tabular-nums ml-1">
              الأعمدة: {boardColumns.length} · المتبقي: {remainingPlayableTiles}{' '}
              / {playableTilesCount > 0 ? playableTilesCount : totalTiles}
            </span>

            <button
              type="button"
              onClick={() => soundFX.toggle()}
              title={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border ${
                soundEnabled
                  ? 'bg-[#EAF2EE] border-[#14543D]/20 text-[#14543D] hover:bg-[#DDECE4]'
                  : 'bg-[#F3F5E9] border-[#E5E8DD] text-[#777B73] hover:text-[#252824]'
              }`}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>الأصوات مفعّلة</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>الأصوات مكتومة</span>
                </>
              )}
            </button>

            {isGameLocked ? (
              <>
                <button
                  type="button"
                  onClick={onGoToCategories}
                  title="عرض فئات الجولة الـ 6 المختارة (مقفلة للقراءة فقط)"
                  className="px-3 py-1.5 text-xs font-semibold text-[#555] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-[#F07842]" />
                  <span>الفئات (مقفلة)</span>
                </button>

                <button
                  type="button"
                  onClick={onGoToSetup}
                  title="عرض بيانات الفرق (مقفلة للقراءة فقط)"
                  className="px-3 py-1.5 text-xs font-semibold text-[#555] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-[#14543D]" />
                  <span>الفرق (مقفلة)</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onGoToCategories}
                  className="px-3 py-1.5 text-xs font-semibold text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-[#F07842]" />
                  <span>تغيير الفئات</span>
                </button>

                <button
                  type="button"
                  onClick={onGoToSetup}
                  className="px-3 py-1.5 text-xs font-semibold text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-[#14543D]" />
                  <span>تعديل الفرق</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setPinnedTileQuestions({});
                setActiveSelection(null);
                onResetBoard();
              }}
              className="px-3 py-1.5 text-xs font-semibold text-[#777B73] hover:text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تصفير اللوحة</span>
            </button>

            <button
              type="button"
              onClick={onFinishGame}
              className="px-4 py-1.5 text-xs font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-[#F07842]" />
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
          } gap-3`}
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
                className={`text-right p-4 rounded-xl border-2 transition-all flex items-center justify-between gap-3 cursor-pointer ${
                  isCurrent
                    ? 'bg-[#F3F5E9] shadow-sm'
                    : 'bg-[#FFFFFF] border-[#E5E8DD] opacity-85 hover:opacity-100'
                }`}
                style={{
                  borderColor: isCurrent ? team.color : '#E5E8DD',
                }}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="font-display text-base font-bold text-[#252824] truncate">
                      {displayTeamName}
                    </span>
                    {isCurrent && (
                      <span className="text-[11px] font-bold text-[#F07842] shrink-0">
                        (دوركم)
                      </span>
                    )}
                  </div>
                  {team.players.length > 0 && (
                    <div className="text-xs text-[#777B73] truncate">
                      {team.players.join(' · ')}
                    </div>
                  )}
                </div>

                <div className="text-left shrink-0">
                  <div
                    className="font-mono tabular-nums text-2xl md:text-3xl font-bold"
                    style={{ color: team.color }}
                  >
                    {team.score}
                  </div>
                  <div className="text-[11px] text-[#777B73]">نقطة</div>
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
            <h2 className="font-display text-base font-bold text-[#252824]">
              لا توجد أسئلة معتمدة في قاعدة البيانات حالياً
            </h2>
            <p className="text-xs text-[#777B73]">
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

      {/* 2. DYNAMIC SUBCATEGORIES GAME BOARD (Responsive across Mobile, Tablet, Laptop & Large TV) */}
      {boardColumns.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-12 text-center space-y-4">
          <p className="font-display text-lg font-bold text-[#252824]">
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
          className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 md:p-6 space-y-3"
        >
          {boardColumns.length > 4 && (
            <div className="flex items-center justify-between text-xs text-[#777B73] pb-1">
              <span>
                اسحب أفقياً لاستعراض جميع الفئات المختارة ({boardColumns.length} فئات)
              </span>
              <span className="font-mono tabular-nums">100 — 500 نقطة</span>
            </div>
          )}

          <div className="overflow-x-auto pb-2">
            <div className="flex items-stretch gap-3 w-full min-w-max">
              {boardColumns.map((col) => (
                <div
                  key={col.subId || col.subName}
                  className="w-[150px] sm:w-[170px] flex-1 min-w-[145px] sm:min-w-[160px] flex flex-col gap-2.5"
                >
                  {/* Subcategory Column Header */}
                  <div
                    className="rounded-xl p-3 text-center border flex flex-col items-center justify-between gap-1.5 min-h-[108px]"
                    style={{
                      backgroundColor: col.bgTint,
                      borderColor: col.borderTint,
                    }}
                  >
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-[#777B73]">
                      <CategoryIcon
                        iconName={col.iconName}
                        color={col.accentColor}
                        className="w-3.5 h-3.5"
                      />
                      <span className="truncate max-w-[120px]">
                        {col.mainCategoryName}
                      </span>
                    </div>

                    <h2 className="font-display text-xs sm:text-sm font-bold text-[#252824] leading-snug line-clamp-2">
                      {col.subName}
                    </h2>

                    {col.teamName && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFFFFF]/80 border border-[#E5E8DD] text-[10px] font-bold text-[#252824] max-w-full">
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
                    )}
                  </div>

                  {/* 5 Point Tiles (100 to 500) */}
                  {POINT_TIERS.map((pts) => {
                    const tileKey = `${col.subName}__${pts}`;
                    const isUsed = usedTileKeys.includes(tileKey);
                    const availableQ = isUsed
                      ? null
                      : getQuestionForSlot(col.subName, pts, col.subId);
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
                        aria-label={
                          isUsed
                            ? `${col.subName} ${pts} نقطة - تم استخدامه`
                            : !availableQ
                            ? `${col.subName} ${pts} نقطة - غير متوفر`
                            : `${col.subName} ${pts} نقطة`
                        }
                        className={`h-16 md:h-20 rounded-xl font-mono tabular-nums text-lg md:text-2xl font-bold border transition-all flex flex-col items-center justify-center ${
                          isUsed
                            ? 'bg-[#F3F5E9]/70 border-[#E5E8DD] text-[#777B73]/45 cursor-not-allowed'
                            : !availableQ
                            ? 'bg-[#F3F5E9]/40 border-dashed border-[#E5E8DD] text-[#777B73]/50 cursor-not-allowed text-xs font-sans'
                            : 'bg-[#F3F5E9] hover:bg-[#F07842] text-[#14543D] hover:text-white border-[#E5E8DD] hover:border-[#F07842] cursor-pointer active:scale-[0.98]'
                        }`}
                      >
                        {isUsed ? (
                          <div className="flex flex-col items-center leading-none gap-1">
                            <span className="line-through text-base md:text-xl">
                              {pts}
                            </span>
                            <span className="text-[10px] font-sans font-semibold no-underline">
                              مُستخدم
                            </span>
                          </div>
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
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3. ACTIVE QUESTION STAGE MODAL */}
      {activeSelection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#252824]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="active-question-heading"
        >
          <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-[#FFFFFF] border-2 border-[#E5E8DD] rounded-2xl overflow-hidden shadow-2xl">
            {/* Modal Top Bar */}
            <div className="bg-[#14543D] text-white px-4 sm:px-6 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/75">
                  {activeSelection.mainCategoryName} /
                </span>
                <span className="font-display text-sm sm:text-base font-bold">
                  {activeSelection.subcategoryName}
                </span>
                <span className="text-white/50" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-[#F07842] bg-white px-2.5 py-0.5 rounded-md">
                  {activeSelection.points} نقطة
                </span>
                <span className="text-xs text-white/80 flex items-center gap-1">
                  {activeSelection.question.imageUrl ? (
                    <>
                      <ImageIcon className="w-3.5 h-3.5 text-[#F07842]" />
                      <span>({activeSelection.question.difficulty} · سؤال مصوّر)</span>
                    </>
                  ) : (
                    <span>({activeSelection.question.difficulty} · سؤال مباشر)</span>
                  )}
                </span>
              </div>

              {/* Countdown Timer Controls */}
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono tabular-nums text-xs sm:text-sm font-bold ${
                    timeLeft === 0
                      ? 'bg-rose-600 text-white'
                      : timeLeft <= 10
                      ? 'bg-[#F07842] text-white'
                      : 'bg-white/15 text-white'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>
                    {timeLeft === 0 ? 'انتهى الوقت (0 ث)' : `${timeLeft} ثانية`}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setTimerPaused((p) => !p)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
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
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  aria-label="إعادة ضبط المؤقت"
                  title="إعادة ضبط المؤقت"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Active Team Banner */}
            <div className="bg-[#F3F5E9] border-b border-[#E5E8DD] px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs shrink-0">
              <div>
                <span className="text-[#777B73]">السؤال موجه إلى: </span>
                <strong
                  className="font-bold"
                  style={{ color: activeTeam?.color || '#14543D' }}
                >
                  {activeTeam?.name?.trim() || `الفريق ${safeTeamIndex + 1}`}
                </strong>
              </div>
              <button
                type="button"
                disabled={!!feedbackBanner}
                onClick={handleCloseModalWithoutScoring}
                className="text-[#777B73] hover:text-[#252824] disabled:opacity-40 font-medium cursor-pointer"
              >
                إغلاق بدون احتساب
              </button>
            </div>

            {/* Scrollable Question Body — Direct Question (Text-only or Illustrated) */}
            <div className="p-5 sm:p-6 md:p-8 space-y-5 overflow-y-auto flex-1">
              <div className="bg-[#F3F5E9]/60 border border-[#E5E8DD] rounded-2xl p-5 sm:p-7 text-center">
                <h3
                  id="active-question-heading"
                  className="font-display text-lg sm:text-xl md:text-2xl font-bold text-[#252824] leading-relaxed"
                >
                  {activeSelection.question.questionText}
                </h3>
              </div>

              {/* Optional Question Image Display — Preserves aspect ratio & responsive across mobile, desktop, and TV */}
              {activeSelection.question.imageUrl && !imageLoadFailed && (
                <div className="bg-[#F3F5E9]/40 border border-[#E5E8DD] rounded-2xl p-3 sm:p-4 flex flex-col items-center gap-2.5">
                  <div className="relative w-full flex items-center justify-center">
                    <img
                      src={activeSelection.question.imageUrl}
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
                      className="max-h-[210px] sm:max-h-[270px] md:max-h-[320px] xl:max-h-[360px] w-auto max-w-full object-contain rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] shadow-xs cursor-zoom-in"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setZoomedImageUrl(
                          activeSelection.question.imageUrl || null
                        )
                      }
                      className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-[#252824]/75 hover:bg-[#252824] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      title="تكبير الصورة"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>تكبير</span>
                    </button>
                  </div>

                  {activeSelection.question.imageDescription && (
                    <p className="text-xs text-[#777B73] text-center leading-relaxed">
                      {activeSelection.question.imageDescription}
                    </p>
                  )}
                </div>
              )}

              {/* Reveal Correct Answer Action or Revealed Answer + Host Judgment Controls */}
              {!answerRevealed ? (
                <div className="pt-2 flex flex-col items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playAnswerReveal();
                      setAnswerRevealed(true);
                    }}
                    className="px-8 py-3.5 text-sm sm:text-base font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center gap-2.5 shadow-sm cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-[#F07842]" />
                    <span>إظهار الإجابة</span>
                  </button>
                  <span className="text-[11px] text-[#777B73]">
                    اضغط على «إظهار الإجابة» بعد استماعك لإجابة الفريق لاحتساب النقاط
                  </span>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="bg-[#F3F5E9] border-2 border-[#14543D]/30 rounded-xl p-5 space-y-2 text-center sm:text-right">
                    <div className="text-xs font-bold text-[#14543D]">
                      الإجابة الصحيحة المعتمدة:
                    </div>
                    <div className="font-display text-lg md:text-2xl font-bold text-[#252824]">
                      {activeSelection.question.correctAnswer}
                    </div>
                    {activeSelection.question.explanation && (
                      <p className="text-xs text-[#777B73] leading-relaxed pt-1">
                        {activeSelection.question.explanation}
                      </p>
                    )}
                    {activeSelection.question.source && (
                      <div className="text-[11px] text-[#777B73]">
                        المصدر: {activeSelection.question.source}
                      </div>
                    )}
                  </div>

                  {/* Feedback Banner on Judgment */}
                  {feedbackBanner && (
                    <div
                      className={`p-4 rounded-xl text-center font-display text-base font-bold ${
                        feedbackBanner.type === 'correct'
                          ? 'bg-[#14543D] text-white'
                          : 'bg-[#F07842] text-white'
                      }`}
                    >
                      {feedbackBanner.text}
                    </div>
                  )}

                  {/* Host Judgment Controls (Shown only AFTER answer is revealed) */}
                  <div className="pt-4 border-t border-[#E5E8DD] flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-[#777B73]">
                      قرار المشرف بعد كشف الإجابة:
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        disabled={!!feedbackBanner}
                        onClick={handleCorrectAnswer}
                        className="flex-1 sm:flex-initial px-6 py-3 text-sm font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>صح عليكم</span>
                        <span className="font-mono text-xs opacity-90">
                          (+{activeSelection.points})
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={!!feedbackBanner}
                        onClick={handleWrongAnswer}
                        className="flex-1 sm:flex-initial px-6 py-3 text-sm font-bold text-white bg-[#F07842] hover:bg-[#D9632E] disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>إجابتكم غلط</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. FULLSCREEN IMAGE LIGHTBOX MODAL (Does not reveal answer) */}
      {zoomedImageUrl && activeSelection && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#252824]/90 backdrop-blur-xs"
          onClick={() => setZoomedImageUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="عرض صورة السؤال بالحجم الكامل"
        >
          <div
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomedImageUrl(null)}
              className="self-end px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>إغلاق التكبير</span>
            </button>
            <img
              src={zoomedImageUrl}
              alt={
                activeSelection.question.imageDescription || 'صورة السؤال مكبرة'
              }
              className="max-h-[80vh] max-w-[92vw] w-auto object-contain rounded-2xl border border-white/20 bg-[#FFFFFF] p-2 shadow-2xl"
            />
            {activeSelection.question.imageDescription && (
              <p className="text-xs sm:text-sm text-white/90 text-center max-w-2xl">
                {activeSelection.question.imageDescription}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
