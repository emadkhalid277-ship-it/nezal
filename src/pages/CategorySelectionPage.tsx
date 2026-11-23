import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Users,
  Lock,
  RotateCcw,
  Sparkles,
  Edit3,
  Play,
  Layers,
  Search,
  Plus,
  Clock,
  ArrowLeftRight,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  LayoutGrid,
} from 'lucide-react';
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from 'motion/react';
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
import { isWalaKalimaCategory } from '../types/walaKalima';

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
  initialSection?: 'categories' | 'teams';
  timerDuration: number;
  onUpdateTimer: (seconds: number) => void;
  approvedQuestionsCount: number;
  isAdmin: boolean;
  onSeedQuestions: () => Promise<void>;
  seeding: boolean;
  isGameLocked?: boolean;
  onBackToHome: () => void;
  onConfirmSelection: () => void;
  onStartGameDirectly: () => void;
  onGoToBoard?: () => void;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

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
  initialSection = 'categories',
  timerDuration,
  onUpdateTimer,
  approvedQuestionsCount,
  isAdmin,
  onSeedQuestions,
  seeding,
  isGameLocked = false,
  onBackToHome,
  onStartGameDirectly,
  onGoToBoard,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMainFilter, setSelectedMainFilter] = useState<string>(
    initialMainCategoryId || 'all'
  );

  useEffect(() => {
    setSelectedMainFilter(initialMainCategoryId || 'all');
  }, [initialMainCategoryId]);

  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [autoAdvanceBanner, setAutoAdvanceBanner] = useState<string | null>(null);
  const [navError, setNavError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [comingSoonToast, setComingSoonToast] = useState<string | null>(null);
  const [playerInputs, setPlayerInputs] = useState<Record<string, string>>({});

  const COMING_SOON_MESSAGE = 'هذه الفئة قادمة قريباً، ترقبوا!';

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    if (initialSection === 'teams') {
      const timer = window.setTimeout(() => {
        scrollToSection('step-team-setup');
      }, 120);
      return () => window.clearTimeout(timer);
    }
  }, [initialSection]);

  const triggerComingSoonMessage = () => {
    setValidationMessage(COMING_SOON_MESSAGE);
    setComingSoonToast(COMING_SOON_MESSAGE);
    window.setTimeout(() => {
      setComingSoonToast((prev) => (prev === COMING_SOON_MESSAGE ? null : prev));
    }, 3200);
  };

  const handleReturnToBoard = () => {
    setNavError(null);
    setIsNavigating(true);
    try {
      if (onGoToBoard) {
        onGoToBoard();
      } else {
        throw new Error('دالة العودة للوحة اللعب غير متاحة');
      }
    } catch (err: unknown) {
      console.error('Error navigating to board:', err);
      setNavError('حدث خطأ أثناء العودة للوحة اللعب. يرجى إعادة المحاولة.');
      setIsNavigating(false);
    }
  };

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

  const comingSoonMainIds = useMemo(
    () =>
      new Set(
        visibleMainCategories.filter((m) => m.isComingSoon).map((m) => m.id)
      ),
    [visibleMainCategories]
  );
  const comingSoonMainNames = useMemo(
    () =>
      new Set(
        visibleMainCategories.filter((m) => m.isComingSoon).map((m) => m.name)
      ),
    [visibleMainCategories]
  );

  const isSubComingSoon = (sub: SubcategoryItem) =>
    Boolean(
      sub.isComingSoon ||
        (sub.mainCategoryId && comingSoonMainIds.has(sub.mainCategoryId)) ||
        comingSoonMainNames.has(sub.mainCategory)
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

  const activeMainCategoryObj = useMemo(
    () =>
      selectedMainFilter === 'all'
        ? null
        : visibleMainCategories.find(
            (m) => m.id === selectedMainFilter || m.name === selectedMainFilter
          ) || null,
    [selectedMainFilter, visibleMainCategories]
  );

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

  const firstIncompleteTeamIndex = useMemo(
    () =>
      teams.findIndex(
        (t) =>
          (teamSubcategoryIds[t.id] || []).filter((id) => subByIdMap.has(id))
            .length < SUBCATEGORIES_PER_TEAM
      ),
    [teams, teamSubcategoryIds, subByIdMap]
  );

  // Filtered subcategories based on the chosen main category & search input
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

  // Coming Soon Main Categories that currently have 0 subcategories still appear as styled Coming Soon card
  const filteredComingSoonMainCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleMainCategories.filter((mc) => {
      if (!mc.isComingSoon) return false;
      const hasActiveSubs = activeSubcategories.some(
        (s) => s.mainCategoryId === mc.id || s.mainCategory === mc.name
      );
      if (hasActiveSubs) return false;
      if (
        selectedMainFilter !== 'all' &&
        selectedMainFilter !== mc.id &&
        selectedMainFilter !== mc.name
      ) {
        return false;
      }
      if (q) {
        const matchesName = mc.name.toLowerCase().includes(q);
        const matchesDesc = (mc.description || mc.tagline || '')
          .toLowerCase()
          .includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [
    visibleMainCategories,
    activeSubcategories,
    selectedMainFilter,
    searchQuery,
  ]);

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

  const handleAddPlayer = (teamId: string) => {
    if (isGameLocked) return;
    const val = (playerInputs[teamId] || '').trim();
    if (!val) return;
    onUpdateTeams(
      teams.map((t) =>
        t.id === teamId
          ? { ...t, players: [...t.players, val.slice(0, 30)] }
          : t
      )
    );
    setPlayerInputs((prev) => ({ ...prev, [teamId]: '' }));
  };

  const handleRemovePlayer = (teamId: string, playerIndex: number) => {
    if (isGameLocked) return;
    onUpdateTeams(
      teams.map((t) =>
        t.id === teamId
          ? {
              ...t,
              players: t.players.filter((_, idx) => idx !== playerIndex),
            }
          : t
      )
    );
  };

  // Toggle subcategory card selection (preserves exact 3/team rule & auto-advance)
  const handleToggleSubcategory = (sub: SubcategoryItem) => {
    if (isSubComingSoon(sub)) {
      triggerComingSoonMessage();
      return;
    }
    if (isGameLocked) {
      setValidationMessage(
        'إعدادات الفئات مقفلة للقراءة فقط طوال فترة الجولة، ولا يمكن تعديل أو تبديل أي فئة أثناء اللعب.'
      );
      return;
    }
    if (!currentTeam) return;
    setValidationMessage(null);

    const ownerInfo = subcategoryOwnerMap.get(sub.id);

    // 1. Already selected by ANOTHER team -> block selection
    if (ownerInfo && ownerInfo.team.id !== currentTeam.id) {
      setValidationMessage(
        `الفئة الفرعية «${sub.name}» اختارها مسبقاً «${
          ownerInfo.team.name || `الفريق ${ownerInfo.teamIndex + 1}`
        }». لا يمكن لفريقين اختيار الفئة نفسها.`
      );
      return;
    }

    // 2. Already selected by CURRENT team -> deselect
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

    // 3. Current team already reached 3/3 -> prevent 4th
    if (currentTeamPicks.length >= SUBCATEGORIES_PER_TEAM) {
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
          `أكمل «${currentTeam.name}» اختيار 3 فئات فرعية (3/3). لتغيير فئة، احذف إحدى الفئات المختارة أولاً بالضغط عليها أو بالضغط على (×).`
        );
      }
      return;
    }

    // 4. Add subcategory to current team
    playSelectionFeedbackSound('select');
    const nextForCurrent = [...currentTeamPicks, sub.id];
    const nextMap: Record<string, string[]> = {
      ...teamSubcategoryIds,
      [currentTeam.id]: nextForCurrent,
    };
    onUpdateTeamSubcategoryIds(nextMap);

    // 5. Auto-advance when current team reaches 3/3
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
          `اكتملت اختيارات جميع الفرق (${totalRequiredCount}/${totalRequiredCount} فئة)! راجع إعدادات الفرق بالأسفل واضغط «يلا نبدأ! افتح لوحة التحدي».`
        );
      }
    } else {
      setAutoAdvanceBanner(null);
    }
  };

  // Remove a specific subcategory from a team
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
    if (isGameLocked || !currentTeam) return;
    setValidationMessage(null);
    setAutoAdvanceBanner(null);
    playSelectionFeedbackSound('deselect');
    onUpdateTeamSubcategoryIds({
      ...teamSubcategoryIds,
      [currentTeam.id]: [],
    });
  };

  // Switch between teams
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
        scrollToSection('step-subcategories');
      }
      return;
    }

    onStartGameDirectly();
  };

  // Focus a specific team for category picking & scroll to subcategories section
  const handleFocusTeamCategories = (teamIndex: number) => {
    if (!isGameLocked) {
      onChangeSelectingTeamIndex(teamIndex);
      setValidationMessage(null);
    }
    scrollToSection('step-subcategories');
  };

  const handleSelectMainCategoryCard = (mainCat: MainCategoryMeta) => {
    setSelectedMainFilter(mainCat.id);
    if (mainCat.isComingSoon) {
      triggerComingSoonMessage();
    } else {
      setValidationMessage(null);
    }
  };

  // Render a team's interactive slot strip
  const renderTeamSlotBlock = (team: TeamConfig, tIdx: number) => {
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
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!isGameLocked) {
            onChangeSelectingTeamIndex(tIdx);
            setValidationMessage(null);
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isGameLocked) {
            e.preventDefault();
            onChangeSelectingTeamIndex(tIdx);
            setValidationMessage(null);
          }
        }}
        className={`flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl transition-all select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] ${
          isCurrent
            ? 'bg-[#FFFFFF] border-2 border-[#F07842] shadow-sm'
            : 'bg-[#F7F8F1] border border-[#E5E8DD] hover:border-[#F07842]/50'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{ backgroundColor: team.color }}
            />
            <span className="font-display text-sm font-bold text-[#1B1F1C] truncate">
              {teamDisplayName}
            </span>
            {isCurrent && !isGameLocked && (
              <span className="text-[11px] font-bold text-[#F07842] shrink-0">
                · يختار الآن
              </span>
            )}
          </div>

          <span
            className={`font-mono tabular-nums text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
              isComplete
                ? 'bg-[#14543D] text-white'
                : isCurrent
                ? 'bg-[#FEF2EC] text-[#F07842] border border-[#F07842]/35'
                : 'bg-[#FFFFFF] text-[#52574E] border border-[#E5E8DD]'
            }`}
          >
            {picks.length}/{SUBCATEGORIES_PER_TEAM}
          </span>
        </div>

        {/* 3 Visual Slot Boxes */}
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((slotIdx) => {
            const subId = picks[slotIdx];
            const subObj = subId ? subByIdMap.get(subId) : undefined;

            if (subObj) {
              return (
                <div
                  key={subObj.id}
                  className="group relative min-h-[78px] sm:min-h-[84px] rounded-xl overflow-hidden border border-[#F07842]/60 bg-[#FFFFFF] flex flex-col shadow-xs"
                  title={`${subObj.name} (${teamDisplayName})`}
                >
                  <div className="relative h-7 w-full overflow-hidden shrink-0 bg-[#14543D]">
                    <CategoryCardArtwork
                      name={subObj.name}
                      mainCategory={subObj.mainCategory}
                      imageUrl={subObj.imageUrl}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 bg-[#1B1F1C] px-1.5 py-1.5 flex items-center justify-center text-center">
                    <span className="font-display text-[11px] font-bold text-white line-clamp-2 leading-tight w-full">
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
                      aria-label={`إزالة ${subObj.name}`}
                      className="absolute top-1 left-1 w-6 h-6 rounded-lg bg-[#1B1F1C]/85 hover:bg-rose-600 text-white flex items-center justify-center shadow-xs cursor-pointer transition-colors z-10"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div
                key={`empty-${slotIdx}`}
                className={`min-h-[78px] sm:min-h-[84px] rounded-xl border border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                  isCurrent
                    ? 'border-[#F07842]/60 bg-[#FEF2EC]/60 text-[#F07842]'
                    : 'border-[#D4D9CC] bg-[#FFFFFF]/70 text-[#777B73]'
                }`}
                title={`الخانة ${slotIdx + 1} لـ ${teamDisplayName}`}
              >
                <Plus className="w-3.5 h-3.5 opacity-80" />
                <span className="text-[11px] font-mono tabular-nums font-bold">
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
    <MotionConfig reducedMotion="user">
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 py-5 md:py-10 space-y-6 md:space-y-8">
        {/* Floating Toast for Coming Soon Clicks */}
        {comingSoonToast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md bg-[#1B1F1C] text-[#FFFFFF] px-4 py-3 rounded-2xl shadow-xl border border-[#F07842] text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5 text-center"
          >
            <Clock className="w-4 h-4 text-[#F07842] shrink-0" />
            <span>{comingSoonToast}</span>
          </div>
        )}

        {/* Lock Banner if Game is Active */}
        {isGameLocked && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#1B1F1C] text-white border border-[#F07842]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-[#F07842] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-display font-bold text-sm sm:text-base">
                  الجولة قيد التشغيل — اختيارات الفرق والفئات مقفلة
                </div>
                <p className="text-xs text-[#D5D9CE] leading-relaxed">
                  تم تثبيت الفرق والفئات المختارة طوال مدة التحدي لحماية نزاهة
                  المنافسة حتى إعلان النتيجة.
                </p>
                {navError && (
                  <div className="text-xs text-rose-300 font-bold mt-1 bg-rose-950/60 px-2.5 py-1 rounded-lg">
                    {navError}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={isNavigating}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleReturnToBoard();
              }}
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer transition-colors flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>
                {isNavigating ? 'جاري الانتقال...' : 'العودة إلى لوحة اللعب'}
              </span>
            </button>
          </div>
        )}

        {/* MAIN ARENA SETUP CONTAINER */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 lg:p-10 space-y-8">
          {/* Header & Step Progress */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[#E5E8DD] pb-5">
            <div className="space-y-2 text-right">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#F07842]">
                <span>إعداد تحدي نِزال</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#52574E]">
                  {totalSelectedCount} / {totalRequiredCount} فئات مختارة
                </span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1B1F1C]">
                اختيار فئات التحدي وتجهيز الفرق
              </h1>
              <p className="text-xs sm:text-sm text-[#52574E] max-w-[60ch] leading-relaxed">
                يختار كل فريق {SUBCATEGORIES_PER_TEAM} فئات فرعية كحد أقصى دون
                تكرار، ثم تُثبّت الاختيارات عند بدء المباراة مباشرة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onBackToHome}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F3F5E9] hover:bg-[#E7EAD8] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowRight className="w-4 h-4 text-[#14543D] shrink-0" />
                <span>الرئيسية</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('step-team-setup')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#EAF2EE] hover:bg-[#DCEAE3] border border-[#14543D]/20 text-xs font-bold text-[#14543D] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Users className="w-4 h-4 text-[#F07842] shrink-0" />
                <span>تجهيز الفرق</span>
                <ArrowDown className="w-3.5 h-3.5 shrink-0" />
              </button>

              {!isGameLocked && currentTeamPicks.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCurrentTeamPicks}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold text-[#52574E] hover:text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E7EAD8] border border-[#E5E8DD] flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="مسح اختيارات الفريق الحالي"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>مسح ({currentTeam?.name})</span>
                </button>
              )}
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION 1: TEAM SLOTS & SELECTION SUMMARY                         */}
          {/* ================================================================= */}
          <section
            aria-label="حالة اختيار الفرق"
            className="bg-[#F3F5E9]/85 border border-[#E5E8DD] rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base sm:text-lg font-bold text-[#1B1F1C]">
                    ملخص اختيارات الفرق
                  </h2>
                  <span className="text-xs font-semibold text-[#52574E] tabular-nums">
                    ({SUBCATEGORIES_PER_TEAM} فئات كحد أقصى لكل فريق)
                  </span>
                </div>
                <p className="text-xs text-[#52574E] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
                  <span>
                    تُثبّت جميع اختيارات الفرق والفئات تلقائياً بمجرد بدء
                    المباراة ولا يمكن تعديلها أثناء الجولة.
                  </span>
                </p>
              </div>

              {!isGameLocked && teams.length >= 2 && (
                <button
                  type="button"
                  onClick={handleToggleBetweenTeams}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1B1F1C] hover:bg-[#2C312D] text-white text-xs font-bold flex items-center justify-center gap-2 self-start md:self-center cursor-pointer transition-colors shrink-0"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
                  <span>
                    تبديل الدور إلى:{' '}
                    {teams[(safeSelectingTeamIndex + 1) % teams.length]?.name ||
                      `الفريق ${((safeSelectingTeamIndex + 1) % teams.length) + 1}`}
                  </span>
                </button>
              )}
            </div>

            <div
              className={`grid grid-cols-1 sm:grid-cols-2 ${
                teams.length === 3
                  ? 'lg:grid-cols-3'
                  : teams.length >= 4
                  ? 'lg:grid-cols-4'
                  : ''
              } gap-3`}
            >
              {teams.map((t, idx) => renderTeamSlotBlock(t, idx))}
            </div>
          </section>

          {/* ================================================================= */}
          {/* SECTION 2: MAIN CATEGORIES GRID (REAL DATABASE IMAGES & ORDER)    */}
          {/* ================================================================= */}
          <section
            id="step-categories"
            aria-labelledby="main-categories-heading"
            className="space-y-4 scroll-mt-24"
          >
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#F07842] text-white font-mono tabular-nums text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div className="space-y-0.5">
                  <h2
                    id="main-categories-heading"
                    className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C]"
                  >
                    اختر الفئة الرئيسية
                  </h2>
                  <p className="text-xs text-[#52574E]">
                    اضغط على أي قسم لاستعراض فئاته الفرعية والاختيار منها، أو
                    استعرض جميع الفئات معاً.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMainFilter('all')}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0 whitespace-nowrap ${
                  selectedMainFilter === 'all'
                    ? 'bg-[#1B1F1C] text-white border-[#1B1F1C]'
                    : 'bg-[#F3F5E9] hover:bg-[#E7EAD8] text-[#1B1F1C] border-[#E5E8DD]'
                }`}
              >
                <LayoutGrid className="w-4 h-4 text-[#F07842] shrink-0" />
                <span>كل الفئات</span>
                <span className="font-mono tabular-nums text-xs opacity-80">
                  ({activeSubcategories.length})
                </span>
              </button>
            </div>

            {visibleMainCategories.length === 0 ? (
              <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl py-10 px-4 text-center space-y-2">
                <p className="font-display text-sm font-bold text-[#1B1F1C]">
                  جاري تحميل الفئات الرئيسية أو لا توجد فئات مفعّلة حالياً.
                </p>
                <p className="text-xs text-[#52574E]">
                  تأكد من اتصال البيانات أو أعد المحاولة بعد لحظات.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {visibleMainCategories.map((mainCat) => {
                  const isSelected =
                    selectedMainFilter === mainCat.id ||
                    selectedMainFilter === mainCat.name;
                  const isComingSoon = Boolean(mainCat.isComingSoon);
                  const subsCount =
                    mainCategoryCounts.totalMap.get(mainCat.id) ??
                    mainCategoryCounts.totalMap.get(mainCat.name) ??
                    0;
                  const selectedInMain =
                    mainCategoryCounts.selectedMap.get(mainCat.id) ??
                    mainCategoryCounts.selectedMap.get(mainCat.name) ??
                    0;

                  return (
                    <motion.button
                      key={mainCat.id}
                      type="button"
                      onClick={() => handleSelectMainCategoryCard(mainCat)}
                      whileHover={shouldReduceMotion ? undefined : { y: -3 }}
                      whileTap={
                        shouldReduceMotion ? undefined : { scale: 0.985 }
                      }
                      transition={{ duration: 0.16, ease: EASE_OUT }}
                      aria-pressed={isSelected}
                      aria-label={
                        isComingSoon
                          ? `${mainCat.name} - قريباً`
                          : `تصفية الفئات الفرعية حسب ${mainCat.name}`
                      }
                      className={`group relative w-full min-w-0 rounded-2xl overflow-hidden flex flex-col text-right transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] ${
                        isComingSoon
                          ? isSelected
                            ? 'bg-[#FEF2EC] border-2 border-dashed border-[#F07842] cursor-pointer'
                            : 'bg-[#F7F8F1] border border-dashed border-[#D4D9CC] hover:border-[#F07842]/70 cursor-pointer'
                          : isSelected
                          ? 'bg-[#FFFFFF] border-2 border-[#F07842] shadow-md cursor-pointer'
                          : 'bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#F07842]/70 shadow-xs hover:shadow-sm cursor-pointer'
                      }`}
                    >
                      {/* Top Highlight Bar when selected */}
                      {isSelected && (
                        <div className="absolute top-0 inset-x-0 h-1 bg-[#F07842] z-20" />
                      )}

                      {/* Uniform Image Zone */}
                      <div className="relative h-24 sm:h-28 w-full overflow-hidden shrink-0 bg-[#14543D]">
                        <CategoryCardArtwork
                          name={mainCat.name}
                          mainCategory={mainCat.name}
                          imageUrl={mainCat.imageUrl}
                          isMainCategory
                          className={
                            isComingSoon ? 'grayscale-[45%] brightness-80' : ''
                          }
                        />

                        {isComingSoon ? (
                          <div className="absolute top-2 inset-x-2 flex items-center justify-between z-10">
                            <span className="px-2 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] font-bold inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>قريباً</span>
                            </span>
                            <span className="w-6 h-6 rounded-md bg-[#1B1F1C]/80 text-white flex items-center justify-center">
                              <Lock className="w-3 h-3" />
                            </span>
                          </div>
                        ) : (
                          selectedInMain > 0 && (
                            <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-[#F07842] text-white font-mono tabular-nums text-[10px] font-bold">
                              {selectedInMain} مختارة
                            </div>
                          )
                        )}
                      </div>

                      {/* Uniform Content Zone */}
                      <div
                        className={`flex-1 w-full p-3 sm:p-4 flex flex-col justify-between gap-2 ${
                          isSelected && !isComingSoon
                            ? 'bg-[#FEF2EC]/55'
                            : isComingSoon
                            ? 'bg-[#F7F8F1]'
                            : 'bg-[#FFFFFF]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <h3
                              className={`font-display text-sm sm:text-base font-bold leading-snug line-clamp-1 ${
                                isSelected
                                  ? 'text-[#F07842]'
                                  : 'text-[#1B1F1C] group-hover:text-[#F07842] transition-colors'
                              }`}
                            >
                              {mainCat.name}
                            </h3>
                            {isSelected && !isComingSoon && (
                              <span className="w-5 h-5 rounded-md bg-[#F07842] text-white flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              </span>
                            )}
                          </div>
                          {mainCat.tagline && (
                            <p className="text-[11px] sm:text-xs text-[#52574E] line-clamp-1">
                              {mainCat.tagline}
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-[#E5E8DD] flex items-center justify-between text-[11px] font-bold">
                          <span className="tabular-nums text-[#666B62]">
                            {isComingSoon
                              ? 'تفتح قريباً'
                              : `${subsCount} فئات فرعية`}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              isSelected ? 'text-[#F07842]' : 'text-[#14543D]'
                            }`}
                          >
                            <span>{isSelected ? 'محددة' : 'تصفح'}</span>
                            <ArrowLeft className="w-3 h-3 shrink-0" />
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ================================================================= */}
          {/* SECTION 3: SUBCATEGORIES GRID WITH SMOOTH FILTER TRANSITIONS      */}
          {/* ================================================================= */}
          <section
            id="step-subcategories"
            aria-labelledby="subcategories-heading"
            className="border-t border-[#E5E8DD] pt-7 space-y-4 scroll-mt-24"
          >
            {/* Subcategories Heading, Active Turn Indicator & Search */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
              <div className="space-y-1 text-right">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="subcategories-heading"
                    className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C]"
                  >
                    {activeMainCategoryObj
                      ? `الفئات الفرعية · ${activeMainCategoryObj.name}`
                      : 'جميع الفئات الفرعية المتاحة'}
                  </h2>
                  {activeMainCategoryObj && (
                    <button
                      type="button"
                      onClick={() => setSelectedMainFilter('all')}
                      className="text-xs font-bold text-[#F07842] hover:underline cursor-pointer"
                    >
                      (عرض الكل)
                    </button>
                  )}
                </div>

                <p className="text-xs text-[#52574E]">
                  الدور الحالي للاختيار:{' '}
                  <strong className="text-[#1B1F1C]">
                    {currentTeam?.name || `الفريق ${safeSelectingTeamIndex + 1}`}
                  </strong>{' '}
                  <span className="font-mono tabular-nums font-bold text-[#F07842]">
                    ({currentTeamPicks.length}/{SUBCATEGORIES_PER_TEAM})
                  </span>
                  <span aria-hidden="true" className="mx-1.5">
                    ·
                  </span>
                  <span className="tabular-nums">
                    المعروض: {filteredSubcategories.length}
                  </span>
                </p>
              </div>

              <div className="relative w-full lg:w-80">
                <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالاسم أو الوصف..."
                  aria-label="ابحث عن فئة فرعية"
                  className="w-full min-h-[44px] pr-10 pl-9 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs sm:text-sm font-medium text-[#1B1F1C] placeholder:text-[#777B73] focus:outline-none focus:border-[#F07842] transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="مسح البحث"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-[#777B73] hover:text-[#1B1F1C] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Auto-Advance Notification Banner */}
            {autoAdvanceBanner && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-[#EAF2EE] border border-[#14543D]/30 text-xs font-bold text-[#14543D] flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#F07842] shrink-0" />
                  <span>{autoAdvanceBanner}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isAllTeamsComplete && (
                    <button
                      type="button"
                      onClick={() => scrollToSection('step-team-setup')}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-[#14543D] text-white text-xs font-bold cursor-pointer hover:bg-[#0E3F2D]"
                    >
                      الانتقال لإعداد الفرق ↓
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAutoAdvanceBanner(null)}
                    className="text-[#52574E] hover:text-[#1B1F1C] text-xs cursor-pointer px-2 py-1"
                  >
                    إخفاء
                  </button>
                </div>
              </div>
            )}

            {/* Validation / Coming Soon Warning Banner */}
            {validationMessage && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-[#FEF2EC] border border-[#F07842] text-xs font-bold text-[#C74E1C] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#F07842] shrink-0" />
                  <span>{validationMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setValidationMessage(null)}
                  aria-label="إغلاق التنبيه"
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[#C74E1C] hover:bg-[#F07842]/10 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Animated Subcategory Cards Grid */}
            <div aria-label="بطاقات الفئات الفرعية">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${selectedMainFilter}-${searchQuery.trim() ? 'search' : 'browse'}`}
                  initial={
                    shouldReduceMotion ? false : { opacity: 0, y: 8 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    shouldReduceMotion ? undefined : { opacity: 0, y: -4 }
                  }
                  transition={{ duration: 0.16, ease: EASE_OUT }}
                >
                  {filteredSubcategories.length === 0 &&
                  filteredComingSoonMainCards.length === 0 ? (
                    <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl py-12 px-4 text-center space-y-3">
                      <p className="font-display text-sm sm:text-base font-bold text-[#1B1F1C]">
                        لا توجد فئات فرعية مطابقة للبحث أو التصنيف المحدد.
                      </p>
                      <p className="text-xs text-[#52574E]">
                        جرّب مسح كلمة البحث أو عرض جميع الفئات الفرعية المتاحة.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedMainFilter('all');
                        }}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        إظهار جميع الفئات
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4">
                      {filteredSubcategories.map((sub) => {
                        const ownerInfo = subcategoryOwnerMap.get(sub.id);
                        const isSelectedByCurrentTeam =
                          Boolean(ownerInfo) &&
                          ownerInfo?.team.id === currentTeam?.id;
                        const isLockedByOtherTeam =
                          Boolean(ownerInfo) &&
                          ownerInfo?.team.id !== currentTeam?.id;
                        const comingSoon = isSubComingSoon(sub);
                        const qCount = getQuestionCountForSub(sub);
                        const ownerTeamName = ownerInfo
                          ? ownerInfo.team.name?.trim() ||
                            `الفريق ${ownerInfo.teamIndex + 1}`
                          : '';

                        if (comingSoon) {
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              aria-disabled="true"
                              onClick={() => triggerComingSoonMessage()}
                              aria-label={`${sub.name} - قريباً، هذه الفئة غير متاحة حالياً`}
                              className="group relative min-h-[224px] w-full min-w-0 rounded-2xl overflow-hidden bg-[#F7F8F1] border border-dashed border-[#D4D9CC] flex flex-col select-none hover:border-[#F07842]/70 transition-colors cursor-not-allowed text-right"
                            >
                              <div className="relative h-24 sm:h-28 w-full overflow-hidden shrink-0">
                                <CategoryCardArtwork
                                  name={sub.name}
                                  mainCategory={sub.mainCategory}
                                  imageUrl={sub.imageUrl}
                                  className="w-full h-full object-cover grayscale-[45%] brightness-80"
                                />
                                <div className="absolute top-2 inset-x-2 flex items-center justify-between z-10">
                                  <span className="px-2 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] font-bold inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span>قريباً</span>
                                  </span>
                                  <span className="w-6 h-6 rounded-md bg-[#1B1F1C]/80 text-white flex items-center justify-center">
                                    <Lock className="w-3 h-3" />
                                  </span>
                                </div>
                              </div>

                              <div className="flex-1 w-full p-3 sm:p-3.5 flex flex-col justify-between gap-2 bg-[#F7F8F1]">
                                <div className="space-y-1">
                                  <h3 className="font-display text-sm sm:text-[15px] font-bold text-[#252824] leading-snug line-clamp-2">
                                    {sub.name}
                                  </h3>
                                  {sub.description && (
                                    <p className="text-[11px] text-[#666B62] line-clamp-2 leading-relaxed">
                                      {sub.description}
                                    </p>
                                  )}
                                </div>
                                <div className="pt-2 border-t border-[#E5E8DD] text-[11px] font-bold text-[#D9602B]">
                                  قادمة قريباً
                                </div>
                              </div>
                            </button>
                          );
                        }

                        return (
                          <motion.button
                            key={sub.id}
                            type="button"
                            disabled={isLockedByOtherTeam}
                            onClick={() => handleToggleSubcategory(sub)}
                            whileHover={
                              shouldReduceMotion || isLockedByOtherTeam
                                ? undefined
                                : { y: -3 }
                            }
                            whileTap={
                              shouldReduceMotion || isLockedByOtherTeam
                                ? undefined
                                : { scale: 0.98 }
                            }
                            transition={{ duration: 0.15, ease: EASE_OUT }}
                            aria-pressed={isSelectedByCurrentTeam}
                            aria-label={
                              isLockedByOtherTeam
                                ? `${sub.name} - غير متاحة، اختارها ${ownerTeamName}`
                                : isSelectedByCurrentTeam
                                ? `${sub.name} - مختارة لفريقك ${currentTeam?.name}، اضغط لإلغاء الاختيار`
                                : `${sub.name} - اضغط لاختيارها لفريق ${currentTeam?.name}`
                            }
                            className={`group relative min-h-[224px] w-full min-w-0 rounded-2xl overflow-hidden flex flex-col select-none text-right transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] ${
                              isSelectedByCurrentTeam
                                ? 'bg-[#FEF2EC] border-2 border-[#F07842] shadow-md cursor-pointer z-10'
                                : isLockedByOtherTeam
                                ? 'bg-[#F7F8F1] border border-[#E5E8DD] opacity-70 saturate-50 cursor-not-allowed'
                                : 'bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#F07842]/80 shadow-xs hover:shadow-md cursor-pointer'
                            }`}
                          >
                            {isSelectedByCurrentTeam && (
                              <div className="absolute top-0 inset-x-0 h-1 bg-[#F07842] z-20" />
                            )}

                            {/* Subcategory Artwork Zone */}
                            <div className="relative h-24 sm:h-28 w-full overflow-hidden shrink-0 bg-[#14543D]">
                              <CategoryCardArtwork
                                name={sub.name}
                                mainCategory={sub.mainCategory}
                                imageUrl={sub.imageUrl}
                                className={`w-full h-full object-cover transition-transform duration-300 ease-out ${
                                  isSelectedByCurrentTeam
                                    ? 'scale-105'
                                    : 'group-hover:scale-105'
                                }`}
                              />

                              <div className="absolute top-2 inset-x-2 flex items-center justify-between z-10">
                                {isLockedByOtherTeam ? (
                                  <div
                                    className="px-2 py-0.5 rounded-md flex items-center gap-1 text-white text-[10px] font-bold truncate max-w-[120px]"
                                    style={{
                                      backgroundColor:
                                        ownerInfo?.team.color || '#1B1F1C',
                                    }}
                                  >
                                    <Lock className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                      {ownerTeamName}
                                    </span>
                                  </div>
                                ) : (
                                  <div
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center border-2 transition-colors ${
                                      isSelectedByCurrentTeam
                                        ? 'bg-[#F07842] border-white text-white shadow-xs'
                                        : 'bg-[#1B1F1C]/65 border-white/75 text-transparent group-hover:border-white group-hover:bg-[#1B1F1C]/85'
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  </div>
                                )}

                                {isWalaKalimaCategory({
                                  subcategoryId: sub.id,
                                  subcategoryName: sub.name,
                                  mainCategoryId: sub.mainCategoryId,
                                  mainCategoryName: sub.mainCategory,
                                }) ? (
                                  <span className="px-2 py-0.5 rounded-md font-sans text-[10px] font-bold bg-[#F07842] text-white">
                                    QR تفاعلي
                                  </span>
                                ) : qCount > 0 ? (
                                  <span className="px-2 py-0.5 rounded-md font-mono tabular-nums text-[10px] font-bold bg-[#1B1F1C]/80 text-white">
                                    {qCount} س
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* Subcategory Details & Selection State */}
                            <div
                              className={`flex-1 w-full p-3 sm:p-3.5 flex flex-col justify-between gap-2 transition-colors ${
                                isSelectedByCurrentTeam
                                  ? 'bg-[#FEF2EC]'
                                  : isLockedByOtherTeam
                                  ? 'bg-[#F7F8F1]'
                                  : 'bg-[#FFFFFF]'
                              }`}
                            >
                              <div className="space-y-1">
                                <h3
                                  className={`font-display text-sm sm:text-[15px] font-bold leading-snug line-clamp-2 ${
                                    isSelectedByCurrentTeam
                                      ? 'text-[#1B1F1C]'
                                      : isLockedByOtherTeam
                                      ? 'text-[#52574E]'
                                      : 'text-[#1B1F1C] group-hover:text-[#F07842] transition-colors'
                                  }`}
                                >
                                  {sub.name}
                                </h3>
                                {sub.description && (
                                  <p className="text-[11px] text-[#52574E] line-clamp-2 leading-relaxed">
                                    {sub.description}
                                  </p>
                                )}
                              </div>

                              <div
                                className={`pt-2 border-t flex items-center justify-between text-[11px] font-bold ${
                                  isSelectedByCurrentTeam
                                    ? 'border-[#F07842]/30 text-[#D9602B]'
                                    : 'border-[#E5E8DD]'
                                }`}
                              >
                                {isSelectedByCurrentTeam ? (
                                  <>
                                    <span>مختارة للفريق</span>
                                    <span className="text-[#1B1F1C] opacity-75">
                                      إلغاء ×
                                    </span>
                                  </>
                                ) : isLockedByOtherTeam ? (
                                  <span className="text-[#666B62] truncate max-w-full">
                                    محجوزة لـ {ownerTeamName}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[#14543D] group-hover:text-[#F07842] transition-colors">
                                      اختيار الفئة
                                    </span>
                                    <Plus className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
                                  </>
                                )}
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}

                      {/* Coming Soon Main Categories without active subcategories */}
                      {filteredComingSoonMainCards.map((mainCat) => (
                        <button
                          key={mainCat.id}
                          type="button"
                          aria-disabled="true"
                          onClick={() => triggerComingSoonMessage()}
                          aria-label={`${mainCat.name} - قريباً، هذه الفئة غير متاحة حالياً`}
                          className="group relative min-h-[224px] w-full min-w-0 rounded-2xl overflow-hidden bg-[#F7F8F1] border border-dashed border-[#D4D9CC] flex flex-col select-none hover:border-[#F07842]/75 transition-colors cursor-not-allowed text-right"
                        >
                          <div className="relative h-24 sm:h-28 w-full overflow-hidden shrink-0">
                            <CategoryCardArtwork
                              name={mainCat.name}
                              mainCategory={mainCat.name}
                              imageUrl={mainCat.imageUrl}
                              isMainCategory
                              className="w-full h-full object-cover grayscale-[45%] brightness-80"
                            />
                            <div className="absolute top-2 inset-x-2 flex items-center justify-between z-10">
                              <span className="px-2 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] font-bold inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>قريباً</span>
                              </span>
                              <span className="w-6 h-6 rounded-md bg-[#1B1F1C]/80 text-white flex items-center justify-center">
                                <Lock className="w-3 h-3" />
                              </span>
                            </div>
                          </div>

                          <div className="flex-1 w-full p-3 sm:p-3.5 flex flex-col justify-between gap-2 bg-[#F7F8F1]">
                            <div className="space-y-1">
                              <h3 className="font-display text-sm sm:text-[15px] font-bold text-[#252824] leading-snug line-clamp-2">
                                {mainCat.name}
                              </h3>
                              {(mainCat.description || mainCat.tagline) && (
                                <p className="text-[11px] text-[#666B62] line-clamp-2 leading-relaxed">
                                  {mainCat.description || mainCat.tagline}
                                </p>
                              )}
                            </div>
                            <div className="pt-2 border-t border-[#E5E8DD] text-[11px] font-bold text-[#D9602B]">
                              غير متاحة حالياً · قريباً
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Quick Next-Step Nudge when all teams have 3/3 */}
            {!isGameLocked && isAllTeamsComplete && (
              <div className="p-4 rounded-2xl bg-[#1B1F1C] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-display text-sm sm:text-base font-bold text-white">
                    اكتمل اختيار جميع الفئات ({totalSelectedCount}/
                    {totalRequiredCount})
                  </div>
                  <p className="text-xs text-[#D5D9CE]">
                    يمكنك مراجعة أسماء الفرق واللاعبين بالأسفل أو بدء التحدي
                    مباشرة.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => scrollToSection('step-team-setup')}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white cursor-pointer transition-colors"
                  >
                    مراجعة الفرق ↓
                  </button>
                  <button
                    type="button"
                    onClick={handleStartChallenge}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span>بدء التحدي الآن</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ================================================================= */}
          {/* SECTION 4: STEP 2 — TEAM SETUP & FINAL START ACTION               */}
          {/* ================================================================= */}
          <section
            id="step-team-setup"
            aria-labelledby="step-team-setup-heading"
            className="border-t border-[#E5E8DD] pt-8 space-y-6 scroll-mt-24"
          >
            {/* Step 2 Subheading + Team Count & Timer Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#1B1F1C] text-white font-mono tabular-nums text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div className="space-y-1">
                  <h2
                    id="step-team-setup-heading"
                    className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C]"
                  >
                    {isGameLocked
                      ? 'بيانات الفرق المشاركة في الجولة'
                      : 'تجهيز الفرق وإعدادات الجولة'}
                  </h2>
                  <p className="text-xs text-[#52574E]">
                    {isGameLocked
                      ? 'الجولة نشطة حالياً. جميع الفرق والفئات مقفلة لمنع التغيير أثناء اللعب.'
                      : 'حدد عدد الفرق، سمّ كل فريق، اختر لونه وأضف أسماء اللاعبين ومدة الإجابة.'}
                  </p>
                </div>
              </div>

              {/* Team Count & Timer Controls */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-1.5 flex flex-wrap items-center gap-1 w-full sm:w-auto">
                  <span className="text-xs font-semibold text-[#52574E] px-2 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-[#14543D]" />
                    <span>عدد الفرق:</span>
                  </span>
                  {[2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={isGameLocked}
                      onClick={() => handleTeamCountChange(num)}
                      title={isGameLocked ? 'مقفلة أثناء سير الجولة' : undefined}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors ${
                        isGameLocked
                          ? 'cursor-not-allowed opacity-80'
                          : 'cursor-pointer'
                      } ${
                        teams.length === num
                          ? 'bg-[#1B1F1C] text-white'
                          : 'text-[#1B1F1C] hover:bg-white'
                      }`}
                    >
                      {num} فرق ({num * SUBCATEGORIES_PER_TEAM})
                    </button>
                  ))}
                </div>

                <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-1.5 flex flex-wrap items-center gap-1 w-full sm:w-auto">
                  <span className="text-xs font-semibold text-[#52574E] px-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>وقت السؤال:</span>
                  </span>
                  {[30, 45, 60, 90].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      disabled={isGameLocked}
                      onClick={() => onUpdateTimer(sec)}
                      title={isGameLocked ? 'مقفلة أثناء سير الجولة' : undefined}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors ${
                        isGameLocked
                          ? 'cursor-not-allowed opacity-80'
                          : 'cursor-pointer'
                      } ${
                        timerDuration === sec
                          ? 'bg-[#F07842] text-white'
                          : 'text-[#1B1F1C] hover:bg-white'
                      }`}
                    >
                      {sec} ث
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Warning if database has 0 approved questions */}
            {approvedQuestionsCount === 0 && (
              <div className="bg-[#FEF2EC] border border-[#F07842] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-display text-sm sm:text-base font-bold text-[#1B1F1C]">
                    تنبيه: قاعدة بيانات Firestore لا تحتوي على أسئلة معتمدة بعد
                  </h3>
                  <p className="text-xs text-[#52574E]">
                    لتشغيل اللوحة بأسئلة حقيقية، يمكنك تعبئة الحزمة التأسيسية
                    المعتمدة في Firestore بضغطة زر.
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={onSeedQuestions}
                    disabled={seeding}
                    className="min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {seeding
                        ? 'جاري الحفظ في Firestore...'
                        : 'تعبئة الحزمة التأسيسية الآن'}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Incomplete Selection Warning */}
            {!isAllTeamsComplete && (
              <div className="p-4 rounded-xl bg-[#FEF2EC] border border-[#F07842] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs font-bold text-[#C74E1C]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    عدد الفرق الحالي ({teams.length} فرق) يتطلب اختيار{' '}
                    {totalRequiredCount} فئات فرعية (3 فئات لكل فريق). يرجى
                    إكمال اختيار الفئات المتبقية قبل بدء الجولة.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isGameLocked}
                  onClick={() =>
                    handleFocusTeamCategories(
                      firstIncompleteTeamIndex >= 0
                        ? firstIncompleteTeamIndex
                        : 0
                    )
                  }
                  className={`min-h-[40px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold whitespace-nowrap ${
                    isGameLocked
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer'
                  }`}
                >
                  إكمال اختيار فئات الفرق ({totalSelectedCount}/
                  {totalRequiredCount}) ↑
                </button>
              </div>
            )}

            {/* Teams Configuration Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {teams.map((team, index) => {
                const teamPicks = (teamSubcategoryIds[team.id] || [])
                  .slice(0, SUBCATEGORIES_PER_TEAM)
                  .map((id) => subByIdMap.get(id))
                  .filter((s): s is SubcategoryItem => Boolean(s));
                const isTeamComplete =
                  teamPicks.length === SUBCATEGORIES_PER_TEAM;

                return (
                  <div
                    key={team.id}
                    className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-2xl p-4 sm:p-5 space-y-4 sm:space-y-5"
                  >
                    <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-xs shrink-0"
                          style={{ backgroundColor: team.color }}
                        />
                        <span className="font-display text-base font-bold text-[#1B1F1C]">
                          الفريق رقم {index + 1}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg font-mono tabular-nums text-xs font-bold ${
                          isTeamComplete
                            ? 'bg-[#EAF2EE] text-[#14543D]'
                            : 'bg-[#FEF2EC] text-[#F07842]'
                        }`}
                      >
                        {teamPicks.length}/{SUBCATEGORIES_PER_TEAM} فئات
                      </span>
                    </div>

                    {/* Team's Selected Subcategories Preview */}
                    <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#1B1F1C]">
                          فئات هذا الفريق (3 فئات):
                        </span>
                        {isGameLocked ? (
                          <span className="text-xs font-bold text-[#666B62] flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5 text-[#F07842]" />
                            <span>مقفلة طوال الجولة</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleFocusTeamCategories(index)}
                            className="text-xs font-bold text-[#14543D] hover:text-[#F07842] flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>
                              {isTeamComplete
                                ? 'تعديل الفئات ↑'
                                : 'اختيار الفئات ↑'}
                            </span>
                          </button>
                        )}
                      </div>

                      {teamPicks.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {teamPicks.map((sub) => (
                            <span
                              key={sub.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FEF2EC] border border-[#F07842]/35 text-xs font-bold text-[#1B1F1C]"
                            >
                              <span>{sub.name}</span>
                              {!isGameLocked && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveSubcategoryFromTeam(
                                      team.id,
                                      sub.id
                                    )
                                  }
                                  aria-label={`إزالة ${sub.name}`}
                                  className="text-[#666B62] hover:text-rose-600 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#C74E1C] font-semibold">
                          لم يختر هذا الفريق فئاته الثلاث بعد (0/3).
                        </p>
                      )}
                    </div>

                    {/* Team Name & Color Picker Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`name-${team.id}`}
                          className="block text-xs font-semibold text-[#1B1F1C]"
                        >
                          اسم الفريق
                        </label>
                        <input
                          id={`name-${team.id}`}
                          type="text"
                          disabled={isGameLocked}
                          readOnly={isGameLocked}
                          value={team.name}
                          onChange={(e) =>
                            handleUpdateTeamName(team.id, e.target.value)
                          }
                          placeholder="مثال: فريق طويق"
                          maxLength={35}
                          className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-sm font-semibold text-[#1B1F1C] focus:outline-none focus:border-[#F07842] ${
                            isGameLocked ? 'cursor-not-allowed opacity-80' : ''
                          }`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-xs font-semibold text-[#1B1F1C]">
                          لون الفريق
                        </span>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {TEAM_COLOR_OPTIONS.map((c) => {
                            const selected = team.color === c.hex;
                            return (
                              <button
                                key={c.hex}
                                type="button"
                                disabled={isGameLocked}
                                onClick={() =>
                                  handleUpdateTeamColor(team.id, c.hex)
                                }
                                title={
                                  isGameLocked ? `${c.name} (مقفل)` : c.name
                                }
                                aria-label={c.name}
                                className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-transform ${
                                  isGameLocked
                                    ? 'cursor-not-allowed'
                                    : 'cursor-pointer'
                                } ${
                                  selected
                                    ? 'scale-110 ring-2 ring-offset-2 ring-[#1B1F1C]'
                                    : isGameLocked
                                    ? 'opacity-40'
                                    : 'opacity-85 hover:opacity-100'
                                }`}
                                style={{ backgroundColor: c.hex }}
                              >
                                {selected && (
                                  <Check className="w-3.5 h-3.5 text-white" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Players List & Add Input */}
                    <div className="space-y-2.5">
                      <label
                        htmlFor={`player-input-${team.id}`}
                        className="block text-xs font-semibold text-[#1B1F1C]"
                      >
                        أعضاء الفريق
                      </label>
                      {!isGameLocked && (
                        <div className="flex items-center gap-2">
                          <input
                            id={`player-input-${team.id}`}
                            type="text"
                            value={playerInputs[team.id] || ''}
                            onChange={(e) =>
                              setPlayerInputs((prev) => ({
                                ...prev,
                                [team.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddPlayer(team.id);
                              }
                            }}
                            placeholder="اكتب اسم اللاعب واضغط إضافة..."
                            className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-xs text-[#1B1F1C] focus:outline-none focus:border-[#F07842]"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddPlayer(team.id)}
                            className="min-h-[44px] px-4 py-2 bg-[#1B1F1C] hover:bg-[#2C312D] text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#F07842]" />
                            <span>إضافة</span>
                          </button>
                        </div>
                      )}

                      {team.players.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {team.players.map((player, pIdx) => (
                            <span
                              key={`${player}-${pIdx}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] text-xs font-medium text-[#1B1F1C]"
                            >
                              <span>{player}</span>
                              {!isGameLocked && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePlayer(team.id, pIdx)
                                  }
                                  aria-label={`حذف ${player}`}
                                  className="text-[#777B73] hover:text-rose-600 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#666B62]">
                          ما أضفتوا أسماء لاعبين بعد (اختياري).
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Matchup Preview & Start Game Footer */}
            <div className="border-t border-[#E5E8DD] pt-6 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-[#F07842]">
                    معاينة المواجهة والملخص النهائي
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#1B1F1C]">
                    جاهزون لبداية النِزال؟
                  </h3>
                </div>

                <div className="text-xs text-[#52574E] flex flex-wrap items-center gap-2">
                  <span>
                    عدد الفرق:{' '}
                    <strong className="font-mono tabular-nums text-[#1B1F1C]">
                      {teams.length}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    الأعمدة المختارة:{' '}
                    <strong className="font-mono tabular-nums text-[#14543D]">
                      {totalSelectedCount} / {totalRequiredCount}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    مدة الإجابة:{' '}
                    <strong className="font-mono tabular-nums text-[#1B1F1C]">
                      {timerDuration} ثانية
                    </strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {teams.map((t, tIdx) => {
                  const teamPicks = (teamSubcategoryIds[t.id] || [])
                    .slice(0, SUBCATEGORIES_PER_TEAM)
                    .map((id) => subByIdMap.get(id)?.name)
                    .filter(Boolean);

                  return (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: t.color }}
                          />
                          <span className="font-display text-xs sm:text-sm font-bold text-[#1B1F1C] truncate">
                            {t.name || `الفريق ${tIdx + 1}`}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-[11px] font-bold text-[#14543D]">
                          {teamPicks.length}/{SUBCATEGORIES_PER_TEAM}
                        </span>
                      </div>
                      <div className="text-xs text-[#1B1F1C] font-semibold line-clamp-1">
                        {teamPicks.length > 0
                          ? teamPicks.join(' · ')
                          : 'لم يتم اختيار الفئات بعد'}
                      </div>
                      <div className="text-[11px] text-[#666B62] truncate">
                        {t.players.length > 0
                          ? t.players.join(' · ')
                          : 'بدون أسماء لاعبين محددة'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isGameLocked && (
                <div className="p-3 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#52574E] flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
                  <span>
                    ملاحظة: بمجرد الضغط على بدء التحدي، تُثبّت اختيارات الفرق
                    والفئات طوال مدة المباراة.
                  </span>
                </div>
              )}

              <div className="pt-1 flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => scrollToSection('step-categories')}
                  className="w-full sm:w-auto min-h-[46px] px-4 py-2.5 text-xs font-bold text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E7EAD8] border border-[#E5E8DD] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[#14543D]" />
                  <span>الرجوع لاختيار الفئات</span>
                </button>

                {isGameLocked ? (
                  <button
                    type="button"
                    disabled={isNavigating}
                    onClick={handleReturnToBoard}
                    className="w-full sm:w-auto min-h-[48px] px-6 sm:px-8 py-3.5 text-sm font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                  >
                    <Lock className="w-4 h-4 text-[#F07842]" />
                    <span>العودة إلى لوحة اللعب (الجولة مقفلة)</span>
                  </button>
                ) : isAllTeamsComplete ? (
                  <button
                    type="button"
                    onClick={handleStartChallenge}
                    className="w-full sm:w-auto min-h-[50px] px-6 sm:px-8 py-3.5 text-sm font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      يلا نبدأ! افتح لوحة التحدي ({totalRequiredCount} أعمدة)
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartChallenge}
                    className="w-full sm:w-auto min-h-[50px] px-6 sm:px-8 py-3.5 text-sm font-bold text-[#FFFFFF] bg-[#1B1F1C] hover:bg-[#2C312D] rounded-xl transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <Layers className="w-4 h-4 text-[#F07842]" />
                    <span>
                      أكمل اختيار الـ {totalRequiredCount} فئات أولاً (
                      {totalSelectedCount}/{totalRequiredCount})
                    </span>
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
};
