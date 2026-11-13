import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowRight,
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
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMainFilter, setSelectedMainFilter] = useState<string>(
    initialMainCategoryId || 'all'
  );
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
    } catch (err: any) {
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
    () => new Set(visibleMainCategories.filter((m) => m.isComingSoon).map((m) => m.id)),
    [visibleMainCategories]
  );
  const comingSoonMainNames = useMemo(
    () => new Set(visibleMainCategories.filter((m) => m.isComingSoon).map((m) => m.name)),
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

  // Coming Soon Main Categories that currently have 0 subcategories (e.g. ولا كلمة) still appear as a styled Coming Soon card
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
        const matchesDesc = (mc.description || mc.tagline || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [visibleMainCategories, activeSubcategories, selectedMainFilter, searchQuery]);

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

  // Toggle subcategory card selection
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
          `أكمل «${currentTeam.name}» اختيار 3 فئات فرعية (3/3). لتغيير فئة، احذف إحدى الفئات المختارة أولاً بالضغط عليها أو بالضغط على (×).`
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
          `اكتملت اختيارات جميع الفرق (${totalRequiredCount}/${totalRequiredCount} فئة)! جهّز الفرق بالأسفل واضغط «يلا نبدأ التحدي».`
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
        scrollToSection('step-categories');
      }
      return;
    }

    onStartGameDirectly();
  };

  // Focus a specific team for category picking & scroll to categories section
  const handleFocusTeamCategories = (teamIndex: number) => {
    if (!isGameLocked) {
      onChangeSelectingTeamIndex(teamIndex);
      setValidationMessage(null);
    }
    scrollToSection('step-categories');
  };

  // Render a team's interactive slot strip inside Step 1
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
        className={`flex flex-col gap-2 p-3 rounded-2xl transition-all select-none cursor-pointer ${
          isCurrent
            ? 'bg-[#EAF2EE] border-2 border-[#14543D] ring-2 ring-[#14543D]/20 shadow-xs'
            : 'bg-[#F3F5E9]/85 border border-[#E5E8DD] hover:border-[#14543D]/40'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: team.color }}
            />
            <span className="font-display text-xs sm:text-sm font-bold text-[#252824] truncate">
              {teamDisplayName}
            </span>
            {isCurrent && !isGameLocked && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#F07842] text-white shrink-0">
                يختار الآن
              </span>
            )}
          </div>

          <span
            className={`font-mono tabular-nums text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 ${
              isComplete
                ? 'bg-[#14543D] text-white'
                : 'text-[#F07842] bg-[#FFFFFF] border border-[#E5E8DD]'
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
                  className="group relative h-12 sm:h-14 rounded-xl overflow-hidden border-2 border-[#14543D] bg-white shadow-xs transition-transform duration-200 hover:scale-[1.03]"
                  title={`${subObj.name} (${teamDisplayName})`}
                >
                  <CategoryCardArtwork
                    name={subObj.name}
                    mainCategory={subObj.mainCategory}
                    imageUrl={subObj.imageUrl}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent flex items-end p-1">
                    <span className="text-[10px] font-bold text-white line-clamp-1 leading-tight w-full text-center">
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
                      className="absolute top-0.5 left-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-90 hover:opacity-100 shadow-sm cursor-pointer hover:scale-110 transition-transform"
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
                className={`h-12 sm:h-14 rounded-xl border-2 border-dashed flex items-center justify-center gap-1 transition-all duration-200 ${
                  isCurrent
                    ? 'border-[#F07842] bg-[#F07842]/10 text-[#F07842]'
                    : 'border-[#D2D6C6] bg-[#FFFFFF]/70 text-[#777B73]'
                }`}
                title={`الخانة ${slotIdx + 1} لـ ${teamDisplayName}`}
              >
                <Plus className="w-3.5 h-3.5 opacity-75" />
                <span className="text-[10px] font-mono font-bold">
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
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 md:py-10">
      {/* Floating Toast for Coming Soon Clicks */}
      {comingSoonToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#252824] text-[#FFFFFF] px-5 py-3 rounded-2xl shadow-xl border-2 border-[#F07842] text-xs sm:text-sm font-bold flex items-center gap-2.5 animate-in fade-in"
        >
          <Clock className="w-4 h-4 text-[#F07842] shrink-0" />
          <span>{comingSoonToast}</span>
        </div>
      )}

      {/* UNIFIED GAME SETUP CARD */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl md:rounded-3xl p-5 sm:p-6 md:p-8 shadow-xs space-y-8">
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
                {navError && (
                  <div className="text-xs text-rose-300 font-bold mt-1 bg-rose-950/50 px-2.5 py-1 rounded-lg">
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
              className="px-5 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] active:scale-95 text-white text-xs sm:text-sm font-bold whitespace-nowrap self-start sm:self-center cursor-pointer shadow-sm transition-all flex items-center gap-2 touch-manipulation select-none disabled:opacity-60"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isNavigating ? 'جاري الانتقال...' : 'العودة إلى لوحة اللعب'}</span>
            </button>
          </div>
        )}

        {/* Unified Card Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#F07842]">
              <Layers className="w-4 h-4" />
              <span>
                إعداد اللعبة · اختيار الفئات وتجهيز الفرق ({totalSelectedCount}/{totalRequiredCount})
              </span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
              إعداد اللعبة
            </h1>
            <p className="text-xs sm:text-sm text-[#777B73]">
              اختر {SUBCATEGORIES_PER_TEAM} فئات فرعية مستقلة لكل فريق أولاً، ثم سمّ الفرق وأضف اللاعبين وابدأ التحدي مباشرة.
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

            <button
              type="button"
              onClick={() => scrollToSection('step-team-setup')}
              className="px-3.5 py-2 rounded-xl bg-[#EAF2EE] hover:bg-[#DCEAE3] border border-[#14543D]/20 text-xs font-bold text-[#14543D] flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-[#F07842]" />
              <span>الانتقال إلى سوّ فريقك</span>
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

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

        {/* =================================================================== */}
        {/* STEP 1 SUBSECTION: اختر الفئات                                      */}
        {/* =================================================================== */}
        <section
          id="step-categories"
          aria-labelledby="step-categories-heading"
          className="space-y-5 scroll-mt-24"
        >
          {/* Step 1 Subheading & Turn Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-[#14543D] text-white font-mono text-sm font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <h2
                  id="step-categories-heading"
                  className="font-display text-lg sm:text-xl font-bold text-[#252824]"
                >
                  اختر الفئات
                </h2>
                <p className="text-xs text-[#777B73]">
                  لكل فريق {SUBCATEGORIES_PER_TEAM} فئات مستقلة بدون تكرار · المختار الآن:{' '}
                  <strong className="font-mono tabular-nums text-[#14543D]">
                    {totalSelectedCount}/{totalRequiredCount}
                  </strong>
                </p>
              </div>
            </div>

            {!isGameLocked && teams.length >= 2 && (
              <button
                type="button"
                onClick={handleToggleBetweenTeams}
                className="px-4 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold flex items-center gap-2 self-start sm:self-center cursor-pointer transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#F07842]" />
                <span>
                  تبديل الدور إلى:{' '}
                  {teams[(safeSelectingTeamIndex + 1) % teams.length]?.name ||
                    `الفريق ${((safeSelectingTeamIndex + 1) % teams.length) + 1}`}
                </span>
              </button>
            )}
          </div>

          {/* Interactive Team Category Slots Strip */}
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

          {/* Search Bar + Main Category Filter Pills */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
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

              <div className="text-xs font-semibold text-[#777B73]">
                الدور الحالي للاختيار:{' '}
                <strong className="text-[#14543D]">
                  {currentTeam?.name || `الفريق ${safeSelectingTeamIndex + 1}`}
                </strong>{' '}
                <span className="font-mono tabular-nums">
                  ({currentTeamPicks.length}/{SUBCATEGORIES_PER_TEAM})
                </span>
              </div>
            </div>

            {/* Horizontal Category Filter Pills */}
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
                  <button
                    key={mainCat.id}
                    type="button"
                    onClick={() => {
                      setSelectedMainFilter(mainCat.id);
                      if (isComingSoon) {
                        triggerComingSoonMessage();
                      }
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#14543D] text-white border-[#14543D] shadow-xs'
                        : isComingSoon
                        ? 'bg-[#FEF2EC]/70 hover:bg-[#FEF2EC] text-[#252824] border-[#F07842]/35'
                        : 'bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] border-[#E5E8DD]'
                    }`}
                  >
                    <span>{mainCat.name}</span>
                    {isComingSoon ? (
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                          isSelected
                            ? 'bg-[#F07842] text-white'
                            : 'bg-[#F07842]/15 text-[#D9602B] border border-[#F07842]/30'
                        }`}
                      >
                        قريباً
                      </span>
                    ) : selectedInMain > 0 ? (
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
            <div className="p-3.5 rounded-xl bg-[#EAF2EE] border border-[#14543D]/30 text-xs font-bold text-[#14543D] flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F07842] shrink-0" />
                <span>{autoAdvanceBanner}</span>
              </div>
              <div className="flex items-center gap-2">
                {isAllTeamsComplete && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('step-team-setup')}
                    className="px-3 py-1 rounded-lg bg-[#14543D] text-white text-[11px] font-bold cursor-pointer hover:bg-[#0E3F2D]"
                  >
                    الانتقال لإعداد الفرق ↓
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAutoAdvanceBanner(null)}
                  className="text-[#777B73] hover:text-[#252824] text-[11px] cursor-pointer"
                >
                  إخفاء
                </button>
              </div>
            </div>
          )}

          {/* Validation / Coming Soon Warning Banner */}
          {validationMessage && (
            <div className="p-3.5 rounded-xl bg-[#FEF2EC] border-2 border-[#F07842] text-xs font-bold text-[#D9602B] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#F07842] shrink-0" />
                <span>{validationMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setValidationMessage(null)}
                className="text-[#D9602B] hover:text-[#252824] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Subcategory Cards Grid */}
          <div aria-label="بطاقات الفئات الفرعية">
            {filteredSubcategories.length === 0 &&
            filteredComingSoonMainCards.length === 0 ? (
              <div className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-2xl py-14 text-center text-sm text-[#777B73] space-y-2">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
                {filteredSubcategories.map((sub) => {
                  const ownerInfo = subcategoryOwnerMap.get(sub.id);
                  const isSelectedByCurrentTeam =
                    Boolean(ownerInfo) && ownerInfo?.team.id === currentTeam?.id;
                  const isLockedByOtherTeam =
                    Boolean(ownerInfo) && ownerInfo?.team.id !== currentTeam?.id;
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
                        className="group relative aspect-square w-full rounded-2xl overflow-hidden bg-[#F3F5E9] border-2 border-dashed border-[#D4D9CC] text-right flex flex-col justify-end select-none opacity-90 hover:border-[#F07842]/70 transition-all duration-300 cursor-not-allowed shadow-xs"
                      >
                        <div className="absolute inset-0">
                          <CategoryCardArtwork
                            name={sub.name}
                            mainCategory={sub.mainCategory}
                            imageUrl={sub.imageUrl}
                            className="w-full h-full object-cover grayscale-[45%] brightness-75 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#1A1E1B]/95 via-[#1A1E1B]/60 to-[#1A1E1B]/30 backdrop-blur-[1px]" />
                        </div>

                        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                          <span className="px-2.5 py-1 rounded-lg bg-[#F07842] text-white text-[10px] sm:text-[11px] font-bold flex items-center gap-1 shadow-md border border-white/25">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>قريباً</span>
                          </span>
                          <span className="w-6 h-6 rounded-lg bg-[#252824]/75 border border-white/20 text-[#F3F5E9]/85 flex items-center justify-center">
                            <Lock className="w-3 h-3" />
                          </span>
                        </div>

                        <div className="relative z-10 p-3 sm:p-3.5 w-full space-y-1">
                          <h3 className="font-display text-xs sm:text-sm md:text-base font-bold text-[#FFFFFF] leading-snug line-clamp-2 drop-shadow-xs">
                            {sub.name}
                          </h3>
                          <div className="text-[10px] sm:text-[11px] font-bold text-[#FFB088]">
                            غير متاحة حالياً · قادمة قريباً
                          </div>
                        </div>
                      </button>
                    );
                  }

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
                          ? 'border-[#F07842] ring-4 ring-[#F07842]/35 ring-offset-2 ring-offset-[#FFFFFF] -translate-y-1.5 scale-[1.02] shadow-[0_14px_28px_-6px_rgba(240,120,66,0.36),0_6px_16px_rgba(20,84,61,0.20)] hover:-translate-y-2 hover:shadow-[0_18px_36px_-6px_rgba(240,120,66,0.45)] cursor-pointer z-10'
                          : isLockedByOtherTeam
                          ? 'border-[#E5E8DD] opacity-50 saturate-50 cursor-not-allowed scale-[0.98]'
                          : 'border-[#E5E8DD] hover:border-[#F07842]/80 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/10 hover:scale-[1.015] active:scale-[0.97] active:translate-y-0 shadow-xs cursor-pointer'
                      }`}
                    >
                      {isSelectedByCurrentTeam && (
                        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#F07842] via-[#FFB088] to-[#F07842] z-20 shadow-[0_0_12px_rgba(240,120,66,0.85)] animate-in fade-in duration-300" />
                      )}

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

                {/* Coming Soon Main Categories (e.g. ولا كلمة) */}
                {filteredComingSoonMainCards.map((mainCat) => (
                  <button
                    key={mainCat.id}
                    type="button"
                    aria-disabled="true"
                    onClick={() => triggerComingSoonMessage()}
                    aria-label={`${mainCat.name} - قريباً، هذه الفئة غير متاحة حالياً`}
                    className="group relative aspect-square w-full rounded-2xl overflow-hidden bg-[#F3F5E9] border-2 border-dashed border-[#D4D9CC] text-right flex flex-col justify-end select-none opacity-90 hover:border-[#F07842]/75 transition-all duration-300 cursor-not-allowed shadow-xs"
                  >
                    <div className="absolute inset-0">
                      <CategoryCardArtwork
                        name={mainCat.name}
                        mainCategory={mainCat.name}
                        imageUrl={mainCat.imageUrl}
                        isMainCategory
                        className="w-full h-full object-cover grayscale-[45%] brightness-75 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1A1E1B]/95 via-[#1A1E1B]/60 to-[#1A1E1B]/30 backdrop-blur-[1px]" />
                    </div>

                    <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                      <span className="px-2.5 py-1 rounded-lg bg-[#F07842] text-white text-[10px] sm:text-[11px] font-bold flex items-center gap-1 shadow-md border border-white/25">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>قريباً</span>
                      </span>
                      <span className="w-6 h-6 rounded-lg bg-[#252824]/75 border border-white/20 text-[#F3F5E9]/85 flex items-center justify-center">
                        <Lock className="w-3 h-3" />
                      </span>
                    </div>

                    <div className="relative z-10 p-3 sm:p-3.5 w-full space-y-1">
                      <h3 className="font-display text-xs sm:text-sm md:text-base font-bold text-[#FFFFFF] leading-snug line-clamp-2 drop-shadow-xs">
                        {mainCat.name}
                      </h3>
                      {(mainCat.description || mainCat.tagline) && (
                        <p className="text-[10px] text-[#F3F5E9]/75 line-clamp-1">
                          {mainCat.description || mainCat.tagline}
                        </p>
                      )}
                      <div className="text-[10px] sm:text-[11px] font-bold text-[#FFB088]">
                        غير متاحة حالياً · قادمة قريباً
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* =================================================================== */}
        {/* STEP 2 SUBSECTION: سوّ فريقك (Same Unified Card, Subheading Divider) */}
        {/* =================================================================== */}
        <section
          id="step-team-setup"
          aria-labelledby="step-team-setup-heading"
          className="border-t-2 border-[#E5E8DD] pt-8 space-y-6 scroll-mt-24"
        >
          {/* Step 2 Subheading + Team Count & Timer Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-[#F07842] text-white font-mono text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <div className="space-y-1">
                <h2
                  id="step-team-setup-heading"
                  className="font-display text-lg sm:text-xl font-bold text-[#252824]"
                >
                  {isGameLocked ? 'بيانات الفرق المشاركة في الجولة' : 'سوّ فريقك'}
                </h2>
                <p className="text-xs text-[#777B73]">
                  {isGameLocked
                    ? 'الجولة نشطة حالياً. جميع الفرق والفئات مقفلة لمنع التغيير أثناء اللعب.'
                    : 'حدد عدد الفرق، سمّ كل فريق، اختر لونه وأضف أسماء اللاعبين ومدة الإجابة.'}
                </p>
              </div>
            </div>

            {/* Team Count & Timer Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-1.5 flex flex-wrap items-center gap-1">
                <span className="text-xs font-semibold text-[#777B73] px-2 flex items-center gap-1">
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors ${
                      isGameLocked
                        ? 'cursor-not-allowed opacity-80'
                        : 'cursor-pointer'
                    } ${
                      teams.length === num
                        ? 'bg-[#14543D] text-white'
                        : 'text-[#252824] hover:bg-white'
                    }`}
                  >
                    {num} فرق ({num * SUBCATEGORIES_PER_TEAM})
                  </button>
                ))}
              </div>

              <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-1.5 flex flex-wrap items-center gap-1">
                <span className="text-xs font-semibold text-[#777B73] px-2 flex items-center gap-1">
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors ${
                      isGameLocked
                        ? 'cursor-not-allowed opacity-80'
                        : 'cursor-pointer'
                    } ${
                      timerDuration === sec
                        ? 'bg-[#F07842] text-white'
                        : 'text-[#252824] hover:bg-white'
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
            <div className="bg-[#FEF2EC] border-2 border-[#F07842] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-display text-sm sm:text-base font-bold text-[#252824]">
                  تنبيه: قاعدة بيانات Firestore لا تحتوي على أسئلة معتمدة بعد
                </h3>
                <p className="text-xs text-[#777B73]">
                  لتشغيل اللوحة بأسئلة حقيقية، يمكنك تعبئة الحزمة التأسيسية المعتمدة في Firestore بضغطة زر.
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onSeedQuestions}
                  disabled={seeding}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
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
              <div className="flex items-start gap-2.5 text-xs font-bold text-[#D9602B]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  عدد الفرق الحالي ({teams.length} فرق) يتطلب اختيار{' '}
                  {totalRequiredCount} فئات فرعية (3 فئات لكل فريق). يرجى إكمال اختيار الفئات المتبقية قبل بدء الجولة.
                </span>
              </div>
              <button
                type="button"
                disabled={isGameLocked}
                onClick={() =>
                  handleFocusTeamCategories(
                    firstIncompleteTeamIndex >= 0 ? firstIncompleteTeamIndex : 0
                  )
                }
                className={`px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold whitespace-nowrap ${
                  isGameLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                }`}
              >
                إكمال اختيار فئات الفرق ({totalSelectedCount}/{totalRequiredCount}) ↑
              </button>
            </div>
          )}

          {/* Teams Configuration Inner Panels (No separate outer cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {teams.map((team, index) => {
              const teamPicks = (teamSubcategoryIds[team.id] || [])
                .slice(0, SUBCATEGORIES_PER_TEAM)
                .map((id) => subByIdMap.get(id))
                .filter((s): s is SubcategoryItem => Boolean(s));
              const isTeamComplete = teamPicks.length === SUBCATEGORIES_PER_TEAM;

              return (
                <div
                  key={team.id}
                  className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-2xl p-5 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="font-display text-base font-bold text-[#252824]">
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
                      الفئات المختارة: {teamPicks.length}/{SUBCATEGORIES_PER_TEAM}
                    </span>
                  </div>

                  {/* Team's 3 Selected Subcategories Preview */}
                  <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#252824]">
                        فئات هذا الفريق (3 فئات):
                      </span>
                      {isGameLocked ? (
                        <span className="text-xs font-bold text-[#777B73] flex items-center gap-1">
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
                            {isTeamComplete ? 'تعديل الفئات ↑' : 'اختيار الفئات ↑'}
                          </span>
                        </button>
                      )}
                    </div>

                    {teamPicks.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {teamPicks.map((sub) => (
                          <span
                            key={sub.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EAF2EE] border border-[#C5DDD1] text-xs font-bold text-[#14543D]"
                          >
                            <span>{sub.name}</span>
                            {!isGameLocked && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveSubcategoryFromTeam(team.id, sub.id)
                                }
                                aria-label={`إزالة ${sub.name}`}
                                className="text-[#14543D]/70 hover:text-rose-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#D9602B] font-semibold">
                        لم يختر هذا الفريق فئاته الثلاث بعد (0/3).
                      </p>
                    )}
                  </div>

                  {/* Team Name & Color Picker Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`name-${team.id}`}
                        className="block text-xs font-semibold text-[#252824]"
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
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-sm font-semibold text-[#252824] focus:outline-none focus:border-[#14543D] ${
                          isGameLocked ? 'cursor-not-allowed opacity-80' : ''
                        }`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-[#252824]">
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
                              onClick={() => handleUpdateTeamColor(team.id, c.hex)}
                              title={isGameLocked ? `${c.name} (مقفل)` : c.name}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-transform ${
                                isGameLocked
                                  ? 'cursor-not-allowed'
                                  : 'cursor-pointer'
                              } ${
                                selected
                                  ? 'scale-110 ring-2 ring-offset-2 ring-[#252824]'
                                  : isGameLocked
                                  ? 'opacity-40'
                                  : 'opacity-80 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: c.hex }}
                            >
                              {selected && <Check className="w-3.5 h-3.5 text-white" />}
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
                      className="block text-xs font-semibold text-[#252824]"
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
                          className="flex-1 px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-xs text-[#252824] focus:outline-none focus:border-[#14543D]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddPlayer(team.id)}
                          className="px-3.5 py-2 bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة</span>
                        </button>
                      </div>
                    )}

                    {team.players.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {team.players.map((player, pIdx) => (
                          <span
                            key={`${player}-${pIdx}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] text-xs font-medium text-[#252824]"
                          >
                            <span>{player}</span>
                            {!isGameLocked && (
                              <button
                                type="button"
                                onClick={() => handleRemovePlayer(team.id, pIdx)}
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
                      <p className="text-xs text-[#777B73]">
                        ما أضفتوا أسماء لاعبين بعد (اختياري).
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Matchup Preview & Start Game Footer inside the Unified Card */}
          <div className="border-t border-[#E5E8DD] pt-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[#14543D]">
                  معاينة المواجهة والملخص النهائي
                </div>
                <h3 className="font-display text-lg font-bold text-[#252824]">
                  مين يتحدى مين؟
                </h3>
              </div>

              <div className="text-xs text-[#777B73] flex flex-wrap items-center gap-2">
                <span>
                  عدد الفرق:{' '}
                  <strong className="font-mono tabular-nums text-[#252824]">
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
                  <strong className="font-mono tabular-nums text-[#252824]">
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
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="font-display text-xs sm:text-sm font-bold text-[#252824] truncate">
                          {t.name || `الفريق ${tIdx + 1}`}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-[#14543D]">
                        {teamPicks.length}/{SUBCATEGORIES_PER_TEAM}
                      </span>
                    </div>
                    <div className="text-xs text-[#252824] font-semibold line-clamp-1">
                      {teamPicks.length > 0
                        ? teamPicks.join(' · ')
                        : 'لم يتم اختيار الفئات بعد'}
                    </div>
                    <div className="text-[11px] text-[#777B73] truncate">
                      {t.players.length > 0
                        ? t.players.join(' · ')
                        : 'بدون أسماء لاعبين محددة'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => scrollToSection('step-categories')}
                className="px-4 py-2.5 text-xs font-bold text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5 text-[#14543D]" />
                <span>الرجوع لاختيار الفئات</span>
              </button>

              {isGameLocked ? (
                <button
                  type="button"
                  disabled={isNavigating}
                  onClick={handleReturnToBoard}
                  className="px-8 py-3.5 text-sm font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer shadow-sm"
                >
                  <Lock className="w-4 h-4 text-[#F07842]" />
                  <span>العودة إلى لوحة اللعب (الجولة مقفلة)</span>
                </button>
              ) : isAllTeamsComplete ? (
                <button
                  type="button"
                  onClick={handleStartChallenge}
                  className="px-8 py-3.5 text-sm font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-xl transition-all flex items-center gap-2.5 cursor-pointer shadow-sm"
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
                  className="px-8 py-3.5 text-sm font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
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
  );
};
