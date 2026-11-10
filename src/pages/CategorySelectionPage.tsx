import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Users,
  Lock,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Edit3,
  Play,
  Layers,
  Search,
  Plus,
  Clock,
  Settings2,
  ArrowLeftRight,
} from 'lucide-react';
import {
  MainCategoryMeta,
  SUBCATEGORIES_PER_TEAM,
  SubcategoryItem,
  TeamConfig,
  TriviaQuestion,
} from '../types/game';
import { TEAM_COLOR_OPTIONS } from '../data/categoriesAndSeed';
import { DEFAULT_TEAM_TEMPLATES } from '../App';
import { CategoryCardArtwork } from '../components/CategoryCardArtwork';
import { matchesSubcategoryQuestion } from '../services/questionService';

interface CategorySelectionPageProps {
  teams: TeamConfig[];
  onUpdateTeams: (teams: TeamConfig[]) => void;
  selectingTeamIndex: number;
  onChangeSelectingTeamIndex: (index: number) => void;
  teamSubcategoryIds: Record<string, string[]>;
  onUpdateTeamSubcategoryIds: (next: Record<string, string[]>) => void;
  mainCategories: MainCategoryMeta[];
  subcategories: SubcategoryItem[];
  approvedQuestions: TriviaQuestion[];
  initialMainCategoryId?: string | null;
  isGameLocked?: boolean;
  onBackToHome: () => void;
  onConfirmSelection: () => void;
  onStartGameDirectly: () => void;
  onGoToBoard?: () => void;
}

function playSelectionFeedbackSound(type: 'select' | 'deselect') {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'select') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.09);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch {
    // Silently continue if audio context is blocked
  }
}

export const CategorySelectionPage: React.FC<CategorySelectionPageProps> = ({
  teams,
  onUpdateTeams,
  selectingTeamIndex,
  onChangeSelectingTeamIndex,
  teamSubcategoryIds,
  onUpdateTeamSubcategoryIds,
  mainCategories,
  subcategories,
  approvedQuestions,
  initialMainCategoryId = null,
  isGameLocked = false,
  onBackToHome,
  onConfirmSelection,
  onStartGameDirectly,
  onGoToBoard,
}) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMainFilter, setSelectedMainFilter] = useState<string>(
    initialMainCategoryId || 'all'
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [autoAdvanceBanner, setAutoAdvanceBanner] = useState<string | null>(null);
  const [isTeamSetupModalOpen, setIsTeamSetupModalOpen] = useState(false);

  const safeSelectingTeamIndex =
    selectingTeamIndex >= 0 && selectingTeamIndex < teams.length
      ? selectingTeamIndex
      : 0;
  const currentTeam = teams[safeSelectingTeamIndex] || teams[0];

  // Only visible, non-deleted main categories sorted by sortOrder
  const visibleMainCategories = useMemo(
    () =>
      mainCategories
        .filter((m) => m.isActive && !m.isDeleted)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [mainCategories]
  );

  const visibleMainIds = useMemo(
    () => new Set(visibleMainCategories.map((m) => m.id)),
    [visibleMainCategories]
  );
  const visibleMainNames = useMemo(
    () => new Set(visibleMainCategories.map((m) => m.name)),
    [visibleMainCategories]
  );

  const activeSubcategories = useMemo(
    () =>
      subcategories.filter(
        (s) =>
          s.isActive &&
          !s.isDeleted &&
          (visibleMainIds.has(s.mainCategoryId) ||
            visibleMainNames.has(s.mainCategory))
      ),
    [subcategories, visibleMainIds, visibleMainNames]
  );

  const subByIdMap = useMemo(() => {
    const map = new Map<string, SubcategoryItem>();
    activeSubcategories.forEach((s) => map.set(s.id, s));
    subcategories.forEach((s) => {
      if (!map.has(s.id)) map.set(s.id, s);
    });
    return map;
  }, [activeSubcategories, subcategories]);

  // Map every selected subcategory ID -> the team that owns it
  const subcategoryOwnerMap = useMemo(() => {
    const map = new Map<
      string,
      { team: TeamConfig; teamIndex: number }
    >();
    teams.forEach((team, idx) => {
      const picks = teamSubcategoryIds[team.id] || [];
      picks.slice(0, SUBCATEGORIES_PER_TEAM).forEach((subId) => {
        if (!map.has(subId)) {
          map.set(subId, { team, teamIndex: idx });
        }
      });
    });
    return map;
  }, [teams, teamSubcategoryIds]);

  const currentTeamPicks = useMemo(
    () =>
      currentTeam
        ? (teamSubcategoryIds[currentTeam.id] || []).slice(
            0,
            SUBCATEGORIES_PER_TEAM
          )
        : [],
    [currentTeam, teamSubcategoryIds]
  );

  const totalRequiredCount = teams.length * SUBCATEGORIES_PER_TEAM;
  const totalSelectedCount = subcategoryOwnerMap.size;

  const isAllTeamsComplete = useMemo(() => {
    if (teams.length < 2) return false;
    const seen = new Set<string>();
    for (const t of teams) {
      const picks = teamSubcategoryIds[t.id] || [];
      if (picks.length !== SUBCATEGORIES_PER_TEAM) return false;
      for (const id of picks) {
        if (seen.has(id)) return false;
        seen.add(id);
      }
    }
    return seen.size === totalRequiredCount;
  }, [teams, teamSubcategoryIds, totalRequiredCount]);

  // Filtered subcategories based on the chosen pill and search input
  const filteredSubcategories = useMemo(() => {
    let list = activeSubcategories;
    if (selectedMainFilter !== 'all') {
      list = list.filter(
        (s) =>
          s.mainCategoryId === selectedMainFilter ||
          s.mainCategory === selectedMainFilter
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.mainCategory && s.mainCategory.toLowerCase().includes(q)) ||
          (s.description && s.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeSubcategories, selectedMainFilter, searchQuery]);

  const questionCountBySubMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const sub of activeSubcategories) {
      map.set(sub.id, 0);
      map.set(sub.name, 0);
    }
    for (const q of approvedQuestions) {
      for (const sub of activeSubcategories) {
        if (
          matchesSubcategoryQuestion(
            q.category,
            sub.name,
            q.subcategoryId,
            sub.id
          )
        ) {
          map.set(sub.id, (map.get(sub.id) || 0) + 1);
          map.set(sub.name, (map.get(sub.name) || 0) + 1);
        }
      }
    }
    return map;
  }, [activeSubcategories, approvedQuestions]);

  const getQuestionCountForSub = (sub: SubcategoryItem) =>
    questionCountBySubMap.get(sub.id) ?? questionCountBySubMap.get(sub.name) ?? 0;

  const mainCategoryCounts = useMemo(() => {
    const totalMap = new Map<string, number>();
    const selectedMap = new Map<string, number>();

    for (const sub of activeSubcategories) {
      const mainId = sub.mainCategoryId || sub.mainCategory;
      const mainName = sub.mainCategory;
      totalMap.set(mainId, (totalMap.get(mainId) || 0) + 1);
      totalMap.set(mainName, (totalMap.get(mainName) || 0) + 1);

      if (subcategoryOwnerMap.has(sub.id)) {
        selectedMap.set(mainId, (selectedMap.get(mainId) || 0) + 1);
        selectedMap.set(mainName, (selectedMap.get(mainName) || 0) + 1);
      }
    }

    return { totalMap, selectedMap };
  }, [activeSubcategories, subcategoryOwnerMap]);

  // Handle changing team count (2, 3, or 4 teams)
  const handleTeamCountChange = (newCount: number) => {
    if (isGameLocked) {
      setValidationMessage(
        'تم قفل إعدادات الفرق والفئات نهائياً بعد بدء الجولة ولا يمكن تغيير عدد الفرق.'
      );
      return;
    }
    if (newCount === teams.length || newCount < 2 || newCount > 4) return;
    setValidationMessage(null);
    setAutoAdvanceBanner(null);

    let nextTeams: TeamConfig[];
    if (newCount < teams.length) {
      nextTeams = teams.slice(0, newCount);
    } else {
      nextTeams = [...teams];
      for (let i = teams.length; i < newCount; i++) {
        const tpl = DEFAULT_TEAM_TEMPLATES[i] || {
          id: `team-${i + 1}`,
          name: `الفريق ${i + 1}`,
          color: TEAM_COLOR_OPTIONS[i % TEAM_COLOR_OPTIONS.length].hex,
          players: [],
        };
        nextTeams.push({ ...tpl, score: 0 });
      }
    }

    onUpdateTeams(nextTeams);

    // Focus the first team that has fewer than 3 picks
    const firstIncompleteIdx = nextTeams.findIndex(
      (t) => (teamSubcategoryIds[t.id] || []).length < SUBCATEGORIES_PER_TEAM
    );
    if (firstIncompleteIdx >= 0) {
      onChangeSelectingTeamIndex(firstIncompleteIdx);
    } else if (safeSelectingTeamIndex >= nextTeams.length) {
      onChangeSelectingTeamIndex(0);
    }
  };

  const handleUpdateTeamName = (teamId: string, newName: string) => {
    if (isGameLocked) return;
    onUpdateTeams(
      teams.map((t) => (t.id === teamId ? { ...t, name: newName } : t))
    );
  };

  const handleUpdateTeamColor = (teamId: string, newColor: string) => {
    if (isGameLocked) return;
    onUpdateTeams(
      teams.map((t) => (t.id === teamId ? { ...t, color: newColor } : t))
    );
  };

  // Toggle subcategory card selection
  const handleToggleSubcategory = (sub: SubcategoryItem) => {
    if (isGameLocked) {
      setValidationMessage(
        'إعدادات الفئات مقفلة للقراءة فقط طوال فترة الجولة، ولا يمكن تعديل أو تبديل أي فئة أثناء اللعب.'
      );
      return;
    }
    if (!currentTeam) return;
    setValidationMessage(null);

    const ownerInfo = subcategoryOwnerMap.get(sub.id);

    // 1. If already selected by ANOTHER team -> block selection
    if (ownerInfo && ownerInfo.team.id !== currentTeam.id) {
      setValidationMessage(
        `الفئة الفرعية «${sub.name}» اختارها مسبقاً «${
          ownerInfo.team.name || `الفريق ${ownerInfo.teamIndex + 1}`
        }». لا يمكن لفريقين اختيار الفئة نفسها.`
      );
      return;
    }

    // 2. If already selected by the CURRENT team -> deselect it
    if (ownerInfo && ownerInfo.team.id === currentTeam.id) {
      playSelectionFeedbackSound('deselect');
      const updatedForTeam = currentTeamPicks.filter((id) => id !== sub.id);
      onUpdateTeamSubcategoryIds({
        ...teamSubcategoryIds,
        [currentTeam.id]: updatedForTeam,
      });
      setAutoAdvanceBanner(null);
      return;
    }

    // 3. If the current team already has 3/3 subcategories -> prevent 4th
    if (currentTeamPicks.length >= SUBCATEGORIES_PER_TEAM) {
      // Find another team that still needs picks
      const nextIncompleteIndex = teams.findIndex(
        (t, idx) =>
          idx !== safeSelectingTeamIndex &&
          (teamSubcategoryIds[t.id] || []).length < SUBCATEGORIES_PER_TEAM
      );
      if (nextIncompleteIndex >= 0) {
        onChangeSelectingTeamIndex(nextIncompleteIndex);
        setValidationMessage(
          `أكمل «${currentTeam.name}» فئاته الثلاث (3/3). انتقل الدور إلى «${teams[nextIncompleteIndex].name}» لإكمال اختياراته.`
        );
      } else {
        setValidationMessage(
          `أكمل «${currentTeam.name}» اختيار 3 فئات فرعية (3/3). لتغيير فئة، احذف إحدى الفئات المختارة أولاً بالضغط عليها أو بالضغط على (×) أسفل الشاشة.`
        );
      }
      return;
    }

    // 4. Add the subcategory to the current team
    playSelectionFeedbackSound('select');
    const nextForCurrent = [...currentTeamPicks, sub.id];
    const nextMap: Record<string, string[]> = {
      ...teamSubcategoryIds,
      [currentTeam.id]: nextForCurrent,
    };
    onUpdateTeamSubcategoryIds(nextMap);

    // 5. Auto-advance to next team if current reaches 3/3!
    if (nextForCurrent.length === SUBCATEGORIES_PER_TEAM) {
      let nextTeamIdx = -1;
      for (let offset = 1; offset < teams.length; offset++) {
        const candidateIdx = (safeSelectingTeamIndex + offset) % teams.length;
        const candidateTeam = teams[candidateIdx];
        const candidatePicks = nextMap[candidateTeam.id] || [];
        if (candidatePicks.length < SUBCATEGORIES_PER_TEAM) {
          nextTeamIdx = candidateIdx;
          break;
        }
      }

      if (nextTeamIdx >= 0) {
        const nextTeam = teams[nextTeamIdx];
        onChangeSelectingTeamIndex(nextTeamIdx);
        setAutoAdvanceBanner(
          `أكمل «${
            currentTeam.name || `الفريق ${safeSelectingTeamIndex + 1}`
          }» اختيار 3 فئات! انتقل الدور تلقائياً إلى «${
            nextTeam.name || `الفريق ${nextTeamIdx + 1}`
          }».`
        );
      } else {
        setAutoAdvanceBanner(
          `اكتملت اختيارات جميع الفرق (${totalRequiredCount}/${totalRequiredCount} فئة)! اضغط «يلا نبدأ التحدي» بالأسفل لبدء الجولة.`
        );
      }
    } else {
      setAutoAdvanceBanner(null);
    }
  };

  // Remove a specific subcategory from a team (e.g. clicking the X on the bottom slot)
  const handleRemoveSubcategoryFromTeam = (teamId: string, subId: string) => {
    if (isGameLocked) {
      setValidationMessage('إعدادات الفئات مقفلة للقراءة فقط طوال فترة الجولة.');
      return;
    }
    setValidationMessage(null);
    setAutoAdvanceBanner(null);
    playSelectionFeedbackSound('deselect');
    const existing = teamSubcategoryIds[teamId] || [];
    onUpdateTeamSubcategoryIds({
      ...teamSubcategoryIds,
      [teamId]: existing.filter((id) => id !== subId),
    });
    const teamIdx = teams.findIndex((t) => t.id === teamId);
    if (teamIdx >= 0) {
      onChangeSelectingTeamIndex(teamIdx);
    }
  };

  // Clear selections for active team
  const handleClearCurrentTeamPicks = () => {
    if (isGameLocked) return;
    if (!currentTeam) return;
    setValidationMessage(null);
    setAutoAdvanceBanner(null);
    playSelectionFeedbackSound('deselect');
    onUpdateTeamSubcategoryIds({
      ...teamSubcategoryIds,
      [currentTeam.id]: [],
    });
  };

  // Switch between teams in the bottom bar
  const handleToggleBetweenTeams = () => {
    if (isGameLocked) return;
    setValidationMessage(null);
    const nextIdx = (safeSelectingTeamIndex + 1) % teams.length;
    onChangeSelectingTeamIndex(nextIdx);
  };

  // Start game handler
  const handleStartChallenge = () => {
    if (!isAllTeamsComplete) {
      const incompleteIdx = teams.findIndex(
        (t) => (teamSubcategoryIds[t.id] || []).length < SUBCATEGORIES_PER_TEAM
      );
      if (incompleteIdx >= 0) {
        const incTeam = teams[incompleteIdx];
        const incCount = (teamSubcategoryIds[incTeam.id] || []).length;
        onChangeSelectingTeamIndex(incompleteIdx);
        setValidationMessage(
          `لا يمكن بدء الجولة قبل أن يختار كل فريق 3 فئات بالضبط. «${
            incTeam.name || `الفريق ${incompleteIdx + 1}`
          }» اختار (${incCount}/3) فقط.`
        );
      }
      return;
    }

    onStartGameDirectly();
  };

  // Render a team's slot block for the bottom bar
  const renderTeamBottomSlotBlock = (team: TeamConfig, tIdx: number) => {
    const picks = (teamSubcategoryIds[team.id] || []).slice(
      0,
      SUBCATEGORIES_PER_TEAM
    );
    const isCurrent = tIdx === safeSelectingTeamIndex;
    const isComplete = picks.length === SUBCATEGORIES_PER_TEAM;
    const teamDisplayName = team.name?.trim() || `الفريق ${tIdx + 1}`;

    return (
      <div
        key={team.id}
        onClick={() => {
          if (!isGameLocked) {
            onChangeSelectingTeamIndex(tIdx);
            setValidationMessage(null);
          }
        }}
        className={`flex flex-col gap-1.5 p-2 sm:p-2.5 rounded-2xl transition-all select-none cursor-pointer ${
          isCurrent
            ? 'bg-[#EAF2EE] border-2 border-[#14543D] ring-2 ring-[#14543D]/25 shadow-sm'
            : 'bg-[#F3F5E9]/90 border border-[#E5E8DD] hover:bg-[#FFFFFF]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: team.color }}
            />
            <span className="font-display text-xs sm:text-sm font-bold text-[#252824] truncate max-w-[110px] sm:max-w-[140px]">
              {teamDisplayName}
            </span>
            {isCurrent && (
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#F07842] text-white shrink-0">
                يختار الآن
              </span>
            )}
          </div>

          <span
            className={`font-mono text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 ${
              isComplete
                ? 'bg-[#14543D] text-white'
                : 'text-[#F07842] bg-[#FFFFFF] border border-[#E5E8DD]'
            }`}
          >
            {picks.length}/{SUBCATEGORIES_PER_TEAM}
          </span>
        </div>

        {/* 3 Visual Slot Boxes */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {[0, 1, 2].map((slotIdx) => {
            const subId = picks[slotIdx];
            const subObj = subId ? subByIdMap.get(subId) : undefined;

            if (subObj) {
              return (
                <div
                  key={subObj.id}
                  className="group relative w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl overflow-hidden border-2 border-[#14543D] ring-2 ring-[#14543D]/25 bg-white shadow-xs shrink-0 transition-transform duration-200 hover:scale-105 animate-in zoom-in-75"
                  title={`${subObj.name} (${teamDisplayName})`}
                >
                  <CategoryCardArtwork
                    name={subObj.name}
                    mainCategory={subObj.mainCategory}
                    imageUrl={subObj.imageUrl}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent flex items-end p-1">
                    <span className="text-[9px] sm:text-[10px] font-bold text-white line-clamp-1 leading-tight w-full text-center">
                      {subObj.name}
                    </span>
                  </div>
                  {!isGameLocked && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSubcategoryFromTeam(team.id, subObj.id);
                      }}
                      title={`إزالة ${subObj.name}`}
                      className="absolute top-0.5 left-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-85 group-hover:opacity-100 shadow-sm cursor-pointer hover:scale-110 transition-transform"
                    >
                      <X className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[3]" />
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div
                key={`empty-${slotIdx}`}
                className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center shrink-0 transition-all duration-200 ${
                  isCurrent
                    ? 'border-[#F07842] bg-[#F07842]/10 text-[#F07842] ring-2 ring-[#F07842]/20'
                    : 'border-[#D2D6C6] bg-[#FFFFFF]/70 text-[#777B73]'
                }`}
                title={`الخانة ${slotIdx + 1} لـ ${teamDisplayName}`}
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 opacity-75" />
                <span className="text-[9px] font-mono font-bold">
                  {slotIdx + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 pt-6 pb-44 space-y-6">
      {/* 1. TOP HEADER & CONTROLS */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 md:p-7 space-y-5 shadow-xs">
        {/* Lock Banner if Game is Active */}
        {isGameLocked && (
          <div className="p-4 rounded-xl bg-[#14543D] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-[#F07842] shrink-0" />
              <div>
                <div className="font-bold text-sm">
                  الجولة قيد التشغيل (إعدادات الفرق والفئات مقفلة للقراءة فقط)
                </div>
                <div className="text-xs text-white/80">
                  تم قفل الفرق والفئات المختارة نهائياً لحماية نزاهة المنافسة حتى انتهاء التحدي وبدء لعبة جديدة.
                </div>
              </div>
            </div>
            {onGoToBoard && (
              <button
                type="button"
                onClick={onGoToBoard}
                className="px-4 py-2 rounded-lg bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold whitespace-nowrap self-start sm:self-center cursor-pointer"
              >
                العودة إلى لوحة اللعب
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#F07842]">
              <Layers className="w-4 h-4" />
              <span>
                اختيار الفئات · {SUBCATEGORIES_PER_TEAM} فئات لكل فريق ({totalSelectedCount}/{totalRequiredCount})
              </span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
              اختر الفئات
            </h1>
            <p className="text-xs sm:text-sm text-[#777B73]">
              اختر 3 فئات فرعية مستقلة لكل فريق، وتظهر الخانات المختارة أسفل الشاشة مباشرة، ثم اضغط «يلا نبدأ التحدي».
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToHome}
              className="px-3.5 py-2 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#252824] flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 text-[#14543D]" />
              <span>الرئيسية</span>
            </button>

            {!isGameLocked && (
              <button
                type="button"
                onClick={() => setIsTeamSetupModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center gap-1.5 cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5 text-[#F07842]" />
                <span>إعدادات الفرق ({teams.length})</span>
              </button>
            )}

            {!isGameLocked && currentTeamPicks.length > 0 && (
              <button
                type="button"
                onClick={handleClearCurrentTeamPicks}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[#777B73] hover:text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] flex items-center gap-1.5 cursor-pointer"
                title="مسح اختيارات الفريق الحالي"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>مسح ({currentTeam?.name})</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar + Main Category Filter Pills */}
        <div className="space-y-3.5">
          {/* Search Input */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم عن أي فئة فرعية..."
              className="w-full pr-10 pl-8 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs sm:text-sm font-semibold text-[#252824] placeholder:text-[#777B73] focus:outline-none focus:border-[#14543D] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777B73] hover:text-[#252824] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Horizontal Category Filter Pills (Matching the Reference Video) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
            <button
              type="button"
              onClick={() => setSelectedMainFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all cursor-pointer ${
                selectedMainFilter === 'all'
                  ? 'bg-[#14543D] text-white border-[#14543D] shadow-xs'
                  : 'bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] border-[#E5E8DD]'
              }`}
            >
              <span>الكل</span>
              <span className="font-mono text-[10px] mr-1.5 opacity-80">
                ({activeSubcategories.length})
              </span>
            </button>

            {visibleMainCategories.map((mainCat) => {
              const isSelected =
                selectedMainFilter === mainCat.id ||
                selectedMainFilter === mainCat.name;
              const subsCount =
                mainCategoryCounts.totalMap.get(mainCat.id) ??
                mainCategoryCounts.totalMap.get(mainCat.name) ??
                0;
              const selectedInMain =
                mainCategoryCounts.selectedMap.get(mainCat.id) ??
                mainCategoryCounts.selectedMap.get(mainCat.name) ??
                0;

              return (
                <button
                  key={mainCat.id}
                  type="button"
                  onClick={() => setSelectedMainFilter(mainCat.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#14543D] text-white border-[#14543D] shadow-xs'
                      : 'bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] border-[#E5E8DD]'
                  }`}
                >
                  <span>{mainCat.name}</span>
                  {selectedInMain > 0 ? (
                    <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-[#F07842] text-white">
                      {selectedInMain}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] opacity-70">
                      ({subsCount})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Auto-Advance Notification Banner */}
        {autoAdvanceBanner && (
          <div className="p-3.5 rounded-xl bg-[#EAF2EE] border border-[#14543D]/30 text-xs font-bold text-[#14543D] flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#F07842] shrink-0" />
              <span>{autoAdvanceBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoAdvanceBanner(null)}
              className="text-[#777B73] hover:text-[#252824] text-[11px] cursor-pointer"
            >
              إخفاء
            </button>
          </div>
        )}

        {/* Validation Warning Banner */}
        {validationMessage && (
          <div className="p-3.5 rounded-xl bg-[#FEF2EC] border-2 border-[#F07842] text-xs font-bold text-[#D9602B] flex items-center justify-between gap-3">
            <span>{validationMessage}</span>
            <button
              type="button"
              onClick={() => setValidationMessage(null)}
              className="text-[#D9602B] hover:text-[#252824] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 2. SUBCATEGORY CARDS GRID (Direct Display of Illustrated Cards) */}
      <section aria-label="بطاقات الفئات الفرعية">
        {filteredSubcategories.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl py-16 text-center text-sm text-[#777B73] space-y-2">
            <p>لا توجد فئات مطابقة للبحث أو التصنيف المحدد.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedMainFilter('all');
              }}
              className="px-4 py-2 rounded-xl bg-[#F07842] text-white text-xs font-bold cursor-pointer"
            >
              إظهار جميع الفئات
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4.5">
            {filteredSubcategories.map((sub) => {
              const ownerInfo = subcategoryOwnerMap.get(sub.id);
              const isSelectedByCurrentTeam =
                Boolean(ownerInfo) && ownerInfo?.team.id === currentTeam?.id;
              const isLockedByOtherTeam =
                Boolean(ownerInfo) && ownerInfo?.team.id !== currentTeam?.id;
              const qCount = getQuestionCountForSub(sub);
              const ownerTeamName = ownerInfo
                ? ownerInfo.team.name?.trim() ||
                  `الفريق ${ownerInfo.teamIndex + 1}`
                : '';

              return (
                <button
                  key={sub.id}
                  type="button"
                  disabled={isLockedByOtherTeam}
                  onClick={() => handleToggleSubcategory(sub)}
                  aria-label={
                    isLockedByOtherTeam
                      ? `${sub.name} - غير متاحة، اختارها ${ownerTeamName}`
                      : isSelectedByCurrentTeam
                      ? `${sub.name} - مختارة لفريقك ${currentTeam?.name}، اضغط لإلغاء الاختيار`
                      : `${sub.name} - اضغط لاختيارها لفريق ${currentTeam?.name}`
                  }
                  className={`group relative aspect-square w-full rounded-2xl overflow-hidden bg-[#FFFFFF] border-2 text-right flex flex-col justify-end select-none transition-all duration-300 ease-out ${
                    isSelectedByCurrentTeam
                      ? 'border-[#F07842] ring-4 ring-[#F07842]/35 ring-offset-2 ring-offset-[#F3F5E9] -translate-y-2 scale-[1.03] shadow-[0_16px_32px_-6px_rgba(240,120,66,0.38),0_6px_16px_rgba(20,84,61,0.22)] hover:-translate-y-2.5 hover:shadow-[0_20px_40px_-6px_rgba(240,120,66,0.48)] cursor-pointer z-10'
                      : isLockedByOtherTeam
                      ? 'border-[#E5E8DD] opacity-50 saturate-50 cursor-not-allowed scale-[0.98]'
                      : 'border-[#E5E8DD] hover:border-[#F07842]/80 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-black/10 hover:scale-[1.015] active:scale-[0.97] active:translate-y-0 shadow-xs cursor-pointer'
                  }`}
                >
                  {/* Top Glowing Luminous Accent for Selected Card */}
                  {isSelectedByCurrentTeam && (
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#F07842] via-[#FFB088] to-[#F07842] z-20 shadow-[0_0_12px_rgba(240,120,66,0.85)] animate-in fade-in duration-300" />
                  )}

                  {/* Full-Bleed Subcategory Artwork with Zoom Micro-interaction */}
                  <div className="absolute inset-0">
                    <CategoryCardArtwork
                      name={sub.name}
                      mainCategory={sub.mainCategory}
                      imageUrl={sub.imageUrl}
                      className={`w-full h-full object-cover transition-transform duration-500 ease-out ${
                        isSelectedByCurrentTeam
                          ? 'scale-105'
                          : 'group-hover:scale-105'
                      }`}
                    />
                    {/* Dynamic Gradient Overlay with Color Shift */}
                    <div
                      className={`absolute inset-0 transition-all duration-300 ${
                        isSelectedByCurrentTeam
                          ? 'bg-gradient-to-t from-[#14543D] via-[#14543D]/55 to-[#F07842]/20'
                          : isLockedByOtherTeam
                          ? 'bg-gradient-to-t from-[#131614]/95 via-[#131614]/65 to-[#131614]/35'
                          : 'bg-gradient-to-t from-[#131614]/90 via-[#131614]/25 to-transparent group-hover:from-[#131614]/95 group-hover:via-[#131614]/40'
                      }`}
                    />
                  </div>

                  {/* Top Badge: Selection Indicator or Lock Badge */}
                  <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                    {isLockedByOtherTeam ? (
                      <div
                        className="px-2 py-0.5 rounded-lg flex items-center gap-1 text-white text-[10px] font-bold shadow-xs truncate max-w-[130px]"
                        style={{
                          backgroundColor: ownerInfo?.team.color || '#252824',
                        }}
                      >
                        <Lock className="w-3 h-3 shrink-0" />
                        <span className="truncate">{ownerTeamName}</span>
                      </div>
                    ) : (
                      <div
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center border-2 transition-all duration-200 ${
                          isSelectedByCurrentTeam
                            ? 'bg-gradient-to-br from-[#F07842] to-[#D9602B] border-white text-white scale-110 shadow-[0_4px_12px_rgba(240,120,66,0.6)] ring-2 ring-[#F07842]/60'
                            : 'bg-[#252824]/50 border-white/60 text-transparent group-hover:border-white group-hover:bg-[#252824]/80 group-hover:scale-105'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3] transition-transform duration-200" />
                      </div>
                    )}

                    {qCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-md backdrop-blur-xs font-mono text-[9px] sm:text-[10px] font-semibold transition-all ${
                          isSelectedByCurrentTeam
                            ? 'bg-[#14543D] text-[#F3F5E9] border border-[#F07842]/40 shadow-xs'
                            : 'bg-[#252824]/75 text-[#F3F5E9]'
                        }`}
                      >
                        {qCount} س
                      </span>
                    )}
                  </div>

                  {/* Subcategory Title & Selection Status Footer */}
                  <div className="relative z-10 p-3 sm:p-3.5 w-full">
                    <h3 className="font-display text-xs sm:text-sm md:text-base font-bold text-[#FFFFFF] leading-snug line-clamp-2 drop-shadow-xs">
                      {sub.name}
                    </h3>
                    <div className="mt-1 flex items-center justify-between text-[10px] sm:text-[11px]">
                      {isSelectedByCurrentTeam ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#F07842]/25 border border-[#F07842]/60 text-[#F07842] font-bold text-[10px] sm:text-[11px] backdrop-blur-xs shadow-xs">
                          <Sparkles className="w-2.5 h-2.5 text-[#F07842] shrink-0" />
                          <span>مختارة لفريقك</span>
                        </span>
                      ) : isLockedByOtherTeam ? (
                        <span className="font-semibold text-white/80 truncate">
                          محجوزة لـ {ownerTeamName}
                        </span>
                      ) : (
                        <span className="text-[#F3F5E9]/70 group-hover:text-white transition-colors">
                          اضغط للاختيار
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. FIXED BOTTOM BAR — MATCHING THE REFERENCE VIDEO */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-[#FFFFFF]/98 backdrop-blur-md border-t-2 border-[#E5E8DD] shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-2.5 sm:py-3">
          {teams.length === 2 ? (
            /* EXACT 2-TEAM LAYOUT AS REQUESTED AND SHOWN IN VIDEO:
               - Right side: Team 1 (name, 3 slots, 0/3)
               - Left side: Team 2 (name, 3 slots, 0/3)
               - Center: Switch button between teams / or Start Challenge when complete
            */
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
              {/* Right Side: Team 1 */}
              <div className="w-full md:w-auto shrink-0">
                {renderTeamBottomSlotBlock(teams[0], 0)}
              </div>

              {/* Center: Switch Button or Start Challenge Button */}
              <div className="flex flex-col items-center justify-center gap-1.5 shrink-0 my-1 md:my-0">
                {isGameLocked ? (
                  <button
                    type="button"
                    onClick={onGoToBoard || handleStartChallenge}
                    className="px-6 py-2.5 rounded-xl bg-[#14543D] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Lock className="w-4 h-4 text-[#F07842]" />
                    <span>العودة إلى لوحة اللعب (الجولة مقفلة)</span>
                  </button>
                ) : isAllTeamsComplete ? (
                  <button
                    type="button"
                    onClick={() => setIsTeamSetupModalOpen(true)}
                    className="px-8 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-display text-sm sm:text-base font-bold flex items-center gap-2 shadow-lg transition-all transform hover:scale-105 active:scale-95 cursor-pointer animate-pulse"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>يلا نبدأ التحدي! ({totalRequiredCount} أعمدة)</span>
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={handleToggleBetweenTeams}
                      className="px-5 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                      title="التبديل إلى الفريق الآخر"
                    >
                      <ArrowLeftRight className="w-4 h-4 text-[#F07842]" />
                      <span>
                        تبديل الدور إلى:{' '}
                        {safeSelectingTeamIndex === 0
                          ? teams[1]?.name || 'الفريق الثاني'
                          : teams[0]?.name || 'الفريق الأول'}
                      </span>
                    </button>
                    <span className="text-[10px] text-[#777B73] font-semibold">
                      الدور الحالي:{' '}
                      <strong className="text-[#14543D]">
                        {currentTeam?.name || `الفريق ${safeSelectingTeamIndex + 1}`}
                      </strong>{' '}
                      ({currentTeamPicks.length}/3)
                    </span>
                  </div>
                )}
              </div>

              {/* Left Side: Team 2 */}
              <div className="w-full md:w-auto shrink-0">
                {renderTeamBottomSlotBlock(teams[1], 1)}
              </div>
            </div>
          ) : (
            /* 3 OR 4 TEAMS RESPONSIVE LAYOUT */
            <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto w-full lg:w-auto pb-1">
                {teams.map((t, idx) => renderTeamBottomSlotBlock(t, idx))}
              </div>

              <div className="flex items-center gap-3 shrink-0 self-center">
                {!isAllTeamsComplete && (
                  <button
                    type="button"
                    onClick={handleToggleBetweenTeams}
                    className="px-4 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-[#F07842]" />
                    <span>تبديل للفريق التالي</span>
                  </button>
                )}

                {isGameLocked ? (
                  <button
                    type="button"
                    onClick={onGoToBoard || handleStartChallenge}
                    className="px-6 py-2.5 rounded-xl bg-[#14543D] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Lock className="w-4 h-4 text-[#F07842]" />
                    <span>العودة للوحة اللعب</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsTeamSetupModalOpen(true)}
                    className={`px-6 py-2.5 rounded-xl font-display text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
                      isAllTeamsComplete
                        ? 'bg-[#F07842] hover:bg-[#D9632E] text-white animate-pulse'
                        : 'bg-[#252824]/80 hover:bg-[#252824] text-white/90'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {isAllTeamsComplete
                        ? 'يلا نبدأ التحدي!'
                        : `إكمال الاختيارات (${totalSelectedCount}/${totalRequiredCount})`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. MODAL: QUICK TEAM SETUP & START CHALLENGE (Matching the Reference Video) */}
      {isTeamSetupModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#131614]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl max-w-lg w-full p-6 md:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-4">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-[#F07842]">
                  تجهيز الفرق وتأكيد الجولة
                </div>
                <h2 className="font-display text-xl font-bold text-[#252824]">
                  جاهزون للتحدي؟
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsTeamSetupModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F3F5E9] hover:bg-[#E5E8DD] flex items-center justify-center text-[#777B73] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Team Count Switcher if not locked */}
            {!isGameLocked && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#252824]">
                  عدد الفرق المشاركة
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleTeamCountChange(num)}
                      className={`py-2 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer ${
                        teams.length === num
                          ? 'bg-[#14543D] text-white'
                          : 'bg-[#F3F5E9] text-[#252824] hover:bg-[#E5E8DD]'
                      }`}
                    >
                      {num} فرق ({num * SUBCATEGORIES_PER_TEAM} فئات)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Team Names & Color Customization */}
            <div className="space-y-3.5 max-h-[240px] overflow-y-auto pr-1">
              {teams.map((t, idx) => {
                const picks = (teamSubcategoryIds[t.id] || []).slice(
                  0,
                  SUBCATEGORIES_PER_TEAM
                );
                return (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#252824]">
                        الفريق {idx + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-[#14543D]">
                        الفئات: {picks.length}/{SUBCATEGORIES_PER_TEAM}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        disabled={isGameLocked}
                        value={t.name}
                        onChange={(e) =>
                          handleUpdateTeamName(t.id, e.target.value)
                        }
                        maxLength={30}
                        placeholder={`الفريق ${idx + 1}`}
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#E5E8DD] text-xs font-semibold text-[#252824] focus:outline-none focus:border-[#14543D]"
                      />

                      {/* Color Palette */}
                      {!isGameLocked && (
                        <div className="flex items-center gap-1">
                          {TEAM_COLOR_OPTIONS.slice(0, 4).map((c) => (
                            <button
                              key={c.hex}
                              type="button"
                              onClick={() => handleUpdateTeamColor(t.id, c.hex)}
                              className={`w-6 h-6 rounded-md transition-transform cursor-pointer ${
                                t.color === c.hex
                                  ? 'scale-110 ring-2 ring-[#252824]'
                                  : 'opacity-70 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: c.hex }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {picks.length > 0 && (
                      <div className="text-[11px] text-[#777B73] font-semibold truncate">
                        {picks
                          .map((id) => subByIdMap.get(id)?.name)
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsTeamSetupModalOpen(false);
                  onConfirmSelection();
                }}
                className="w-full sm:w-1/2 py-3 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] text-xs font-bold text-[#252824] transition-colors cursor-pointer"
              >
                تخصيص كامل للاعبين
              </button>

              <button
                type="button"
                disabled={!isAllTeamsComplete}
                onClick={() => {
                  setIsTeamSetupModalOpen(false);
                  handleStartChallenge();
                }}
                className={`w-full sm:w-1/2 py-3 rounded-xl font-display text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                  isAllTeamsComplete
                    ? 'bg-[#F07842] hover:bg-[#D9632E] text-white active:scale-95'
                    : 'bg-[#252824]/40 text-white cursor-not-allowed'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {isAllTeamsComplete ? 'ابدأ الآن!' : 'أكمل الفئات أولاً'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
