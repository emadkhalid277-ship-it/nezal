import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import {
  auth,
  checkUserIsAdmin,
  signInWithGooglePopup,
  signOutUser,
} from './lib/firebase';
import {
  ContactSettings,
  DEFAULT_BRAND_NAME,
  MainCategoryMeta,
  PageView,
  SUBCATEGORIES_PER_TEAM,
  SubcategoryItem,
  TeamConfig,
  TriviaQuestion,
} from './types/game';
import {
  DEFAULT_SUBCATEGORIES,
  INITIAL_SEED_QUESTIONS,
  MAIN_CATEGORIES,
  TEAM_COLOR_OPTIONS,
} from './data/categoriesAndSeed';
import { ALL_EXPANDED_QUESTIONS } from './data/questions';
import {
  DEFAULT_CONTACT_SETTINGS,
  cleanupRemovedMoviesCategoryInFirestore,
  convertExistingQuestionsToDirectInFirestore,
  fetchActiveSubcategories,
  fetchAllQuestionsForAdmin,
  fetchAllSubcategoriesForAdmin,
  fetchApprovedQuestions,
  fetchContactSettingsFromFirestore,
  fetchMainCategoriesFromFirestore,
  matchesSubcategoryQuestion,
  recordGameSessionInFirestore,
  seedInitialQuestionsToFirestore,
} from './services/questionService';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';

// Code-split heavy pages to keep initial bundle ultra-light and fast
const CategorySelectionPage = lazy(() =>
  import('./pages/CategorySelectionPage').then((m) => ({
    default: m.CategorySelectionPage,
  }))
);
const TeamSetupPage = lazy(() =>
  import('./pages/TeamSetupPage').then((m) => ({ default: m.TeamSetupPage }))
);
const GameBoardPage = lazy(() =>
  import('./pages/GameBoardPage').then((m) => ({ default: m.GameBoardPage }))
);
const ResultsPage = lazy(() =>
  import('./pages/ResultsPage').then((m) => ({ default: m.ResultsPage }))
);
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage').then((m) => ({
    default: m.AdminDashboardPage,
  }))
);
const ContactPage = lazy(() =>
  import('./pages/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const MyQuestionListsPage = lazy(() =>
  import('./pages/MyQuestionListsPage').then((m) => ({
    default: m.MyQuestionListsPage,
  }))
);
const OnlineMultiplayerPage = lazy(() =>
  import('./pages/OnlineMultiplayerPage').then((m) => ({
    default: m.OnlineMultiplayerPage,
  }))
);

function PageFallback() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/20 flex items-center justify-center mb-4">
        <div className="w-6 h-6 border-3 border-[#14543D] border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-sm font-bold text-[#14543D]">جاري تحميل الصفحة...</p>
    </div>
  );
}

export const DEFAULT_TEAM_TEMPLATES: Omit<TeamConfig, 'score'>[] = [
  {
    id: 'team-1',
    name: 'فريق طويق',
    color: '#14543D',
    players: ['سعود', 'فهد'],
  },
  {
    id: 'team-2',
    name: 'فريق الصقور',
    color: '#F07842',
    players: ['خالد', 'عبدالله'],
  },
  {
    id: 'team-3',
    name: 'فريق العارض',
    color: '#1E3A5F',
    players: ['سلطان', 'نواف'],
  },
  {
    id: 'team-4',
    name: 'فريق النخبة',
    color: '#8C2D38',
    players: ['فيصل', 'تركي'],
  },
];

const INITIAL_TEAMS: TeamConfig[] = DEFAULT_TEAM_TEMPLATES.slice(0, 2).map(
  (t) => ({
    ...t,
    score: 0,
  })
);

export const BUILTIN_FALLBACK_QUESTIONS: TriviaQuestion[] = ALL_EXPANDED_QUESTIONS;

const GAME_SESSION_STORAGE_KEY = 'nizal_game_session_v1';
const VALID_PAGES: PageView[] = [
  'home',
  'categories',
  'setup',
  'board',
  'results',
  'contact',
  'admin',
  'my_lists',
  'online_multiplayer',
];

interface SavedGameSession {
  activePage?: PageView;
  isGameLocked?: boolean;
  teams?: TeamConfig[];
  teamSubcategoryIds?: Record<string, string[]>;
  selectingTeamIndex?: number;
  timerDuration?: number;
  activeTeamIndex?: number;
  usedTileKeys?: string[];
  roundUsedQuestionIds?: string[];
  usedQuestionIds?: string[];
}

function loadSavedGameSession(): SavedGameSession {
  try {
    const raw = localStorage.getItem(GAME_SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Sanitize per-team subcategory IDs: resolve against activeSubcategories, cap at 3 per team, and strictly forbid duplicates across teams
function sanitizeTeamSubcategoryPicks(
  rawMap: Record<string, string[]> | undefined,
  currentTeams: TeamConfig[],
  availableSubs: SubcategoryItem[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const globallyClaimedIds = new Set<string>();
  const subById = new Map<string, SubcategoryItem>();
  availableSubs.forEach((s) => subById.set(s.id, s));

  for (const team of currentTeams) {
    const rawList =
      rawMap && Array.isArray(rawMap[team.id]) ? rawMap[team.id] : [];
    const cleanForTeam: string[] = [];

    for (const token of rawList) {
      if (cleanForTeam.length >= SUBCATEGORIES_PER_TEAM) break;
      const trimmed = String(token || '').trim();
      if (!trimmed) continue;

      let matchedSub = subById.get(trimmed);
      if (!matchedSub) {
        matchedSub = availableSubs.find(
          (s) =>
            s.name === trimmed || matchesSubcategoryQuestion(trimmed, s.name)
        );
      }

      if (availableSubs.length > 0) {
        if (!matchedSub) continue;
        if (globallyClaimedIds.has(matchedSub.id)) continue;
        globallyClaimedIds.add(matchedSub.id);
        cleanForTeam.push(matchedSub.id);
      } else {
        if (globallyClaimedIds.has(trimmed)) continue;
        globallyClaimedIds.add(trimmed);
        cleanForTeam.push(trimmed);
      }
    }

    result[team.id] = cleanForTeam;
  }

  return result;
}

export default function App() {
  const [brandName, setBrandName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('trivia_brand_name');
      if (!saved || saved === 'ميدان التحدي') {
        localStorage.setItem('trivia_brand_name', DEFAULT_BRAND_NAME);
        return DEFAULT_BRAND_NAME;
      }
      return saved;
    } catch {
      return DEFAULT_BRAND_NAME;
    }
  });

  const [initialRoomCode, setInitialRoomCode] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room') || params.get('join') || null;
    } catch {
      return null;
    }
  });

  const [activePage, setActivePage] = useState<PageView>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('room') || params.get('join')) return 'online_multiplayer';
    } catch {
      // ignore
    }
    const saved = loadSavedGameSession().activePage;
    return saved && VALID_PAGES.includes(saved) ? saved : 'home';
  });

  const [initialMainCategoryId, setInitialMainCategoryId] =
    useState<string | null>(null);

  // Firebase Auth & Admin State
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Firestore Questions, Categories & Contact Settings State
  const [allQuestions, setAllQuestions] = useState<TriviaQuestion[]>(
    () => BUILTIN_FALLBACK_QUESTIONS
  );
  const [mainCategories, setMainCategories] =
    useState<MainCategoryMeta[]>(MAIN_CATEGORIES);
  const [subcategories, setSubcategories] = useState<SubcategoryItem[]>(
    DEFAULT_SUBCATEGORIES
  );
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [contactSettings, setContactSettings] = useState<ContactSettings>(
    DEFAULT_CONTACT_SETTINGS
  );
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Game Session State (Persisted across page refreshes)
  const [isGameLocked, setIsGameLocked] = useState<boolean>(() => {
    const saved = loadSavedGameSession().isGameLocked;
    return Boolean(saved);
  });

  const [teams, setTeams] = useState<TeamConfig[]>(() => {
    const saved = loadSavedGameSession().teams;
    if (Array.isArray(saved) && saved.length >= 2 && saved.length <= 4) {
      return saved.map((t, idx) => ({
        id: String(t.id || `team-${idx + 1}`),
        name: String(t.name ?? `الفريق ${idx + 1}`),
        color: String(
          t.color || TEAM_COLOR_OPTIONS[idx % TEAM_COLOR_OPTIONS.length].hex
        ),
        players: Array.isArray(t.players) ? t.players.map(String) : [],
        score: Number.isFinite(Number(t.score)) ? Number(t.score) : 0,
      }));
    }
    return INITIAL_TEAMS;
  });

  // Per-Team Selected Subcategory IDs (3 per team, linked to fixed subcategory IDs, no duplicates across teams)
  const [teamSubcategoryIds, setTeamSubcategoryIds] = useState<
    Record<string, string[]>
  >(() => {
    const savedSession = loadSavedGameSession();
    const initialTeams =
      Array.isArray(savedSession.teams) &&
      savedSession.teams.length >= 2 &&
      savedSession.teams.length <= 4
        ? savedSession.teams
        : INITIAL_TEAMS;

    if (
      savedSession.teamSubcategoryIds &&
      typeof savedSession.teamSubcategoryIds === 'object'
    ) {
      return sanitizeTeamSubcategoryPicks(
        savedSession.teamSubcategoryIds,
        initialTeams,
        DEFAULT_SUBCATEGORIES
      );
    }

    const emptyMap: Record<string, string[]> = {};
    initialTeams.forEach((t) => {
      emptyMap[t.id] = [];
    });
    return emptyMap;
  });

  const [selectingTeamIndex, setSelectingTeamIndex] = useState<number>(() => {
    const saved = loadSavedGameSession().selectingTeamIndex;
    return typeof saved === 'number' && saved >= 0 ? saved : 0;
  });

  const [timerDuration, setTimerDuration] = useState<number>(() => {
    const saved = loadSavedGameSession().timerDuration;
    return typeof saved === 'number' && [30, 45, 60, 90].includes(saved)
      ? saved
      : 60;
  });

  const [activeTeamIndex, setActiveTeamIndex] = useState<number>(() => {
    const saved = loadSavedGameSession().activeTeamIndex;
    return typeof saved === 'number' && saved >= 0 ? saved : 0;
  });

  const [usedTileKeys, setUsedTileKeys] = useState<string[]>(() => {
    const saved = loadSavedGameSession().usedTileKeys;
    return Array.isArray(saved) ? saved.map(String) : [];
  });

  const [roundUsedQuestionIds, setRoundUsedQuestionIds] = useState<string[]>(
    () => {
      const saved = loadSavedGameSession().roundUsedQuestionIds;
      return Array.isArray(saved) ? saved.map(String) : [];
    }
  );

  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>(() => {
    const saved = loadSavedGameSession().usedQuestionIds;
    return Array.isArray(saved) ? saved.map(String) : [];
  });

  // Clamp activeTeamIndex and selectingTeamIndex if teams count changes
  useEffect(() => {
    if (teams.length > 0 && activeTeamIndex >= teams.length) {
      setActiveTeamIndex(0);
    }
    if (teams.length > 0 && selectingTeamIndex >= teams.length) {
      setSelectingTeamIndex(0);
    }
  }, [teams.length, activeTeamIndex, selectingTeamIndex]);

  // Only subcategories that are active AND belong to an active, non-deleted main category appear in new games
  const activeSubcategories = useMemo(() => {
    const visibleMainCategoryIds = new Set(
      mainCategories
        .filter((m) => m.isActive && !m.isDeleted)
        .map((m) => m.id)
    );
    const visibleMainCategoryNames = new Set(
      mainCategories
        .filter((m) => m.isActive && !m.isDeleted)
        .map((m) => m.name)
    );
    return subcategories.filter(
      (s) =>
        s.isActive &&
        !s.isDeleted &&
        ((s.mainCategoryId && visibleMainCategoryIds.has(s.mainCategoryId)) ||
          visibleMainCategoryNames.has(s.mainCategory))
    );
  }, [subcategories, mainCategories]);

  // Keep teamSubcategoryIds synchronized and deduplicated whenever teams or activeSubcategories change
  useEffect(() => {
    if (!categoriesLoaded || activeSubcategories.length === 0) return;

    setTeamSubcategoryIds((prev) => {
      const sanitized = sanitizeTeamSubcategoryPicks(
        prev,
        teams,
        activeSubcategories
      );
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(sanitized);
      const isSame =
        prevKeys.length === nextKeys.length &&
        nextKeys.every(
          (k) =>
            Array.isArray(prev[k]) &&
            prev[k].length === sanitized[k].length &&
            prev[k].every((val, i) => val === sanitized[k][i])
        );
      return isSame ? prev : sanitized;
    });
  }, [categoriesLoaded, activeSubcategories, teams]);

  // Ordered flat list of selected subcategories across all teams (6 for 2 teams, 9 for 3 teams, 12 for 4 teams)
  const orderedTeamSelections = useMemo(() => {
    const subById = new Map<string, SubcategoryItem>();
    activeSubcategories.forEach((s) => subById.set(s.id, s));
    subcategories.forEach((s) => {
      if (!subById.has(s.id)) subById.set(s.id, s);
    });

    const seenIds = new Set<string>();
    const list: {
      subcategoryId: string;
      subcategoryName: string;
      teamId: string;
      teamName: string;
      teamColor: string;
      teamIndex: number;
    }[] = [];

    teams.forEach((team, teamIdx) => {
      const picks = (teamSubcategoryIds[team.id] || []).slice(
        0,
        SUBCATEGORIES_PER_TEAM
      );
      for (const subId of picks) {
        if (seenIds.has(subId)) continue;
        const subObj =
          subById.get(subId) ||
          activeSubcategories.find((s) => s.name === subId);
        if (!subObj) continue;
        if (seenIds.has(subObj.id)) continue;
        seenIds.add(subObj.id);
        list.push({
          subcategoryId: subObj.id,
          subcategoryName: subObj.name,
          teamId: team.id,
          teamName: team.name || `الفريق ${teamIdx + 1}`,
          teamColor: team.color,
          teamIndex: teamIdx,
        });
      }
    });

    return list;
  }, [teams, teamSubcategoryIds, activeSubcategories, subcategories]);

  const selectedSubcategories = useMemo(
    () => orderedTeamSelections.map((item) => item.subcategoryName),
    [orderedTeamSelections]
  );

  const requiredSubcategoriesCount = teams.length * SUBCATEGORIES_PER_TEAM;

  const isAllTeamsSelectionComplete = useMemo(() => {
    if (teams.length < 2) return false;
    const uniqueIds = new Set<string>();
    for (const team of teams) {
      const picks = teamSubcategoryIds[team.id] || [];
      if (picks.length !== SUBCATEGORIES_PER_TEAM) return false;
      for (const id of picks) {
        if (uniqueIds.has(id)) return false;
        uniqueIds.add(id);
      }
    }
    return (
      uniqueIds.size === requiredSubcategoriesCount &&
      orderedTeamSelections.length === requiredSubcategoriesCount
    );
  }, [
    teams,
    teamSubcategoryIds,
    requiredSubcategoriesCount,
    orderedTeamSelections.length,
  ]);

  // Persist game session state to localStorage whenever it changes
  useEffect(() => {
    try {
      const sessionPayload: SavedGameSession = {
        activePage,
        isGameLocked,
        teams,
        teamSubcategoryIds,
        selectingTeamIndex,
        timerDuration,
        activeTeamIndex,
        usedTileKeys,
        roundUsedQuestionIds,
        usedQuestionIds,
      };
      localStorage.setItem(
        GAME_SESSION_STORAGE_KEY,
        JSON.stringify(sessionPayload)
      );
      localStorage.setItem(
        'trivia_selected_subcategories',
        JSON.stringify(selectedSubcategories)
      );
    } catch {
      // ignore storage errors
    }
  }, [
    activePage,
    isGameLocked,
    teams,
    teamSubcategoryIds,
    selectingTeamIndex,
    timerDuration,
    activeTeamIndex,
    usedTileKeys,
    roundUsedQuestionIds,
    usedQuestionIds,
    selectedSubcategories,
  ]);

  const handleUpdateBrandName = (newName: string) => {
    setBrandName(newName);
    try {
      localStorage.setItem('trivia_brand_name', newName);
    } catch {
      // ignore storage errors
    }
  };

  const handleUpdateTeams = useCallback(
    (nextTeams: TeamConfig[]) => {
      if (isGameLocked) return;
      setTeams(nextTeams);
      setTeamSubcategoryIds((prev) =>
        sanitizeTeamSubcategoryPicks(prev, nextTeams, activeSubcategories)
      );
    },
    [isGameLocked, activeSubcategories]
  );

  const handleUpdateTeamSubcategoryIds = useCallback(
    (nextMap: Record<string, string[]>) => {
      if (isGameLocked) return;
      setTeamSubcategoryIds(
        sanitizeTeamSubcategoryPicks(nextMap, teams, activeSubcategories)
      );
    },
    [isGameLocked, teams, activeSubcategories]
  );

  // Load questions from Firestore and merge seamlessly with the built-in expanded question bank
  const loadQuestions = useCallback(async (adminAccess: boolean) => {
    setLoadingQuestions(true);
    try {
      const firestoreList = adminAccess
        ? await fetchAllQuestionsForAdmin()
        : await fetchApprovedQuestions();

      const firestoreQuestions = firestoreList || [];
      const firestoreMap = new Map<string, TriviaQuestion>();
      firestoreQuestions.forEach((q) => {
        firestoreMap.set(q.id, q);
      });

      // Merge: Firestore documents take precedence over built-in questions, preserving the full question bank
      const mergedList = BUILTIN_FALLBACK_QUESTIONS.map((builtin) => {
        return firestoreMap.get(builtin.id) || builtin;
      });

      // Also include any additional custom questions created in Firestore that are not in BUILTIN_FALLBACK_QUESTIONS
      const builtinIds = new Set(BUILTIN_FALLBACK_QUESTIONS.map((b) => b.id));
      firestoreQuestions.forEach((fq) => {
        if (!builtinIds.has(fq.id)) {
          mergedList.push(fq);
        }
      });

      setAllQuestions(mergedList);
      return mergedList;
    } catch (err) {
      console.error('Failed to load questions from Firestore:', err);
      setAllQuestions(BUILTIN_FALLBACK_QUESTIONS);
      return BUILTIN_FALLBACK_QUESTIONS;
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  // Load main categories (including custom Firebase images, descriptions, order, visibility) from Firestore
  const loadMainCategories = useCallback(async () => {
    try {
      const mains = await fetchMainCategoriesFromFirestore();
      setMainCategories(mains);
      return mains;
    } catch (err) {
      console.error('Failed to load main categories from Firestore:', err);
      return MAIN_CATEGORIES;
    }
  }, []);

  // Load subcategories from Firestore
  const loadSubcategories = useCallback(
    async (adminAccess: boolean, mainsOverride?: MainCategoryMeta[]) => {
      try {
        const currentMains = mainsOverride ?? mainCategories;
        const subs = adminAccess
          ? await fetchAllSubcategoriesForAdmin(currentMains)
          : await fetchActiveSubcategories(currentMains);
        setSubcategories(subs);
        return subs;
      } catch (err) {
        console.error('Failed to load subcategories from Firestore:', err);
        return DEFAULT_SUBCATEGORIES;
      }
    },
    [mainCategories]
  );

  // Load contact settings from Firestore
  const loadContactSettings = useCallback(async () => {
    try {
      const settings = await fetchContactSettingsFromFirestore();
      setContactSettings(settings);
      return settings;
    } catch (err) {
      console.error('Failed to load contact settings from Firestore:', err);
      return DEFAULT_CONTACT_SETTINGS;
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      const adminStatus = await checkUserIsAdmin(currentUser);
      setIsAdmin(adminStatus);
      setAuthLoading(false);

      if (adminStatus && currentUser) {
        // Run migration/cleanup at most once per session in background without blocking initial render
        const migrationKey = 'nizal_admin_cleanup_done_v1';
        if (!sessionStorage.getItem(migrationKey)) {
          sessionStorage.setItem(migrationKey, 'true');
          cleanupRemovedMoviesCategoryInFirestore().catch((err) =>
            console.error('Cleanup/convert legacy data error:', err)
          );
          convertExistingQuestionsToDirectInFirestore().catch((err) =>
            console.error('Convert questions error:', err)
          );
        }
      }

      const loadedMains = await loadMainCategories();
      const [loadedQuestions] = await Promise.all([
        loadQuestions(adminStatus),
        loadSubcategories(adminStatus, loadedMains),
        loadContactSettings(),
      ]);
      setCategoriesLoaded(true);

      // Auto-seed foundational questions & subcategories once if an admin signs in to an empty database
      if (adminStatus && currentUser && loadedQuestions.length === 0) {
        setSeeding(true);
        try {
          await seedInitialQuestionsToFirestore(currentUser.uid, new Set());
          const seededMains = await loadMainCategories();
          await Promise.all([
            loadQuestions(true),
            loadSubcategories(true, seededMains),
          ]);
        } catch (e) {
          console.error('Auto-seed error:', e);
        } finally {
          setSeeding(false);
        }
      }
    });

    return () => unsubscribe();
  }, [
    loadQuestions,
    loadMainCategories,
    loadSubcategories,
    loadContactSettings,
  ]);

  const approvedQuestions = useMemo(
    () => allQuestions.filter((q) => q.status !== 'rejected'),
    [allQuestions]
  );

  const handleSeedFoundationalPack = async () => {
    if (!user || !isAdmin) return;
    setSeeding(true);
    try {
      const existingIds = new Set(allQuestions.map((q) => q.id));
      await seedInitialQuestionsToFirestore(user.uid, existingIds);
      const mains = await loadMainCategories();
      await Promise.all([
        loadQuestions(true),
        loadSubcategories(true, mains),
      ]);
    } finally {
      setSeeding(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    try {
      await signInWithGooglePopup();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOutUser();
    setIsAdmin(false);
  };

  const handleNavigate = (page: PageView) => {
    if (page === 'categories') {
      setInitialMainCategoryId(null);
    }
    if (page === 'board' && !isAllTeamsSelectionComplete) {
      // Do not allow entering the board until every team has selected 3 unique subcategories
      const firstIncompleteIdx = teams.findIndex(
        (t) => (teamSubcategoryIds[t.id] || []).length < SUBCATEGORIES_PER_TEAM
      );
      if (firstIncompleteIdx >= 0) {
        setSelectingTeamIndex(firstIncompleteIdx);
      }
      setActivePage('categories');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (page === 'admin' && !isAdmin) {
      setActivePage('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearModalLocalStorage = () => {
    try {
      localStorage.removeItem('nizal_pinned_tile_questions_v1');
      localStorage.removeItem('nizal_active_question_modal_v1');
    } catch {
      // ignore
    }
  };

  // Game Board Handlers
  const handleStartGameFromSetup = () => {
    if (!isAllTeamsSelectionComplete) {
      const firstIncompleteIdx = teams.findIndex(
        (t) => (teamSubcategoryIds[t.id] || []).length < SUBCATEGORIES_PER_TEAM
      );
      if (firstIncompleteIdx >= 0) {
        setSelectingTeamIndex(firstIncompleteIdx);
      }
      setActivePage('categories');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    clearModalLocalStorage();
    setIsGameLocked(true);
    setTeams((prev) =>
      prev.map((t, idx) => ({
        ...t,
        name: t.name.trim() || `الفريق ${idx + 1}`,
        score: 0,
      }))
    );
    setUsedTileKeys([]);
    setRoundUsedQuestionIds([]);
    setActiveTeamIndex(0);
    setActivePage('board');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const defaultTotalBoardTiles = Math.max(
    1,
    orderedTeamSelections.length * 5
  );

  const handleAwardPoints = (
    teamIndex: number,
    points: number,
    tileKey: string,
    questionId: string,
    playableTilesCount?: number
  ) => {
    // Idempotency guard: prevent double scoring for the same tile
    if (usedTileKeys.includes(tileKey)) return;

    setTeams((prev) => {
      const safeIndex =
        teamIndex >= 0 && teamIndex < prev.length ? teamIndex : 0;
      return prev.map((t, idx) =>
        idx === safeIndex ? { ...t, score: t.score + points } : t
      );
    });

    const nextUsedTiles = [...usedTileKeys, tileKey];
    setUsedTileKeys(nextUsedTiles);
    setRoundUsedQuestionIds((prev) =>
      prev.includes(questionId) ? prev : [...prev, questionId]
    );
    setUsedQuestionIds((prev) =>
      prev.includes(questionId) ? prev : [...prev, questionId]
    );
    setActiveTeamIndex((prev) =>
      teams.length > 0 ? (prev + 1) % teams.length : 0
    );

    const targetTotal =
      typeof playableTilesCount === 'number' && playableTilesCount > 0
        ? playableTilesCount
        : defaultTotalBoardTiles;

    if (nextUsedTiles.length >= targetTotal) {
      const sorted = [...teams].sort((a, b) => b.score - a.score);
      const winner = sorted[0];
      recordGameSessionInFirestore({
        teams,
        selectedSubcategories,
        totalQuestionsPlayed: nextUsedTiles.length,
        winnerTeamName: winner ? winner.name : '',
        winnerScore: winner ? winner.score : 0,
        userId: user?.uid || null,
      }).catch(() => {});

      setActivePage('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleMarkTileUsedNoPoints = (
    tileKey: string,
    questionId: string,
    playableTilesCount?: number
  ) => {
    // Idempotency guard: prevent marking the same tile used twice
    if (usedTileKeys.includes(tileKey)) return;

    const nextUsedTiles = [...usedTileKeys, tileKey];
    setUsedTileKeys(nextUsedTiles);
    setRoundUsedQuestionIds((prev) =>
      prev.includes(questionId) ? prev : [...prev, questionId]
    );
    setUsedQuestionIds((prev) =>
      prev.includes(questionId) ? prev : [...prev, questionId]
    );
    setActiveTeamIndex((prev) =>
      teams.length > 0 ? (prev + 1) % teams.length : 0
    );

    const targetTotal =
      typeof playableTilesCount === 'number' && playableTilesCount > 0
        ? playableTilesCount
        : defaultTotalBoardTiles;

    if (nextUsedTiles.length >= targetTotal) {
      const sorted = [...teams].sort((a, b) => b.score - a.score);
      const winner = sorted[0];
      recordGameSessionInFirestore({
        teams,
        selectedSubcategories,
        totalQuestionsPlayed: nextUsedTiles.length,
        winnerTeamName: winner ? winner.name : '',
        winnerScore: winner ? winner.score : 0,
        userId: user?.uid || null,
      }).catch(() => {});

      setActivePage('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleResetBoard = () => {
    clearModalLocalStorage();
    setTeams((prev) => prev.map((t) => ({ ...t, score: 0 })));
    setUsedTileKeys([]);
    setRoundUsedQuestionIds([]);
    setActiveTeamIndex(0);
  };

  const hasActiveGame =
    isAllTeamsSelectionComplete &&
    (usedTileKeys.length > 0 || teams.some((t) => t.score > 0));

  return (
    <div
      id="top"
      dir="rtl"
      className="min-h-screen flex flex-col bg-[#F3F5E9] text-[#252824]"
    >
      <Navbar
        brandName={brandName}
        activePage={activePage}
        onNavigate={handleNavigate}
        hasActiveGame={hasActiveGame}
        isGameLocked={isGameLocked}
        selectedSubcategoriesCount={orderedTeamSelections.length}
        user={user}
        isAdmin={isAdmin}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <Suspense fallback={<PageFallback />}>
              {activePage === 'home' && (
              <HomePage
                onStartCategorySelection={() => handleNavigate('categories')}
                onNavigate={handleNavigate}
              />
            )}

            {activePage === 'categories' && (
              <CategorySelectionPage
                teams={teams}
                onUpdateTeams={handleUpdateTeams}
                selectingTeamIndex={selectingTeamIndex}
                onChangeSelectingTeamIndex={setSelectingTeamIndex}
                teamSubcategoryIds={teamSubcategoryIds}
                onUpdateTeamSubcategoryIds={handleUpdateTeamSubcategoryIds}
                mainCategories={mainCategories}
                subcategories={activeSubcategories}
                approvedQuestions={approvedQuestions}
                initialMainCategoryId={initialMainCategoryId}
                isGameLocked={isGameLocked}
                onBackToHome={() => handleNavigate('home')}
                onConfirmSelection={() => handleNavigate('setup')}
                onStartGameDirectly={handleStartGameFromSetup}
                onGoToBoard={() => handleNavigate('board')}
              />
            )}

            {activePage === 'setup' && (
              <TeamSetupPage
                teams={teams}
                timerDuration={timerDuration}
                teamSubcategoryIds={teamSubcategoryIds}
                subcategories={activeSubcategories}
                isAllTeamsSelectionComplete={isAllTeamsSelectionComplete}
                isGameLocked={isGameLocked}
                onUpdateTeams={handleUpdateTeams}
                onUpdateTimer={setTimerDuration}
                onStartGame={handleStartGameFromSetup}
                onGoToBoard={() => handleNavigate('board')}
                onBackToCategories={(teamIdx) => {
                  if (typeof teamIdx === 'number') {
                    setSelectingTeamIndex(teamIdx);
                  }
                  handleNavigate('categories');
                }}
                approvedQuestionsCount={approvedQuestions.length}
                isAdmin={isAdmin}
                onSeedQuestions={handleSeedFoundationalPack}
                seeding={seeding}
              />
            )}

            {activePage === 'board' && (
              <GameBoardPage
                teams={teams}
                activeTeamIndex={activeTeamIndex}
                orderedTeamSelections={orderedTeamSelections}
                selectedSubcategories={selectedSubcategories}
                mainCategories={mainCategories}
                subcategories={activeSubcategories}
                usedTileKeys={usedTileKeys}
                roundUsedQuestionIds={roundUsedQuestionIds}
                usedQuestionIds={usedQuestionIds}
                timerDuration={timerDuration}
                approvedQuestions={approvedQuestions}
                isGameLocked={isGameLocked}
                onAwardPoints={handleAwardPoints}
                onMarkTileUsedNoPoints={handleMarkTileUsedNoPoints}
                onSelectTurn={setActiveTeamIndex}
                onFinishGame={() => handleNavigate('results')}
                onResetBoard={handleResetBoard}
                onGoToCategories={() => handleNavigate('categories')}
                onGoToSetup={() => handleNavigate('setup')}
                isAdmin={isAdmin}
                onSeedQuestions={handleSeedFoundationalPack}
                seeding={seeding}
              />
            )}

            {activePage === 'results' && (
              <ResultsPage
                teams={teams}
                usedCount={usedTileKeys.length}
                onPlayAgainSameTeams={() => {
                  handleResetBoard();
                  handleNavigate('board');
                }}
                onEditTeamsNewGame={() => {
                  setIsGameLocked(false);
                  handleResetBoard();
                  handleNavigate('categories');
                }}
                onBackHome={() => {
                  setIsGameLocked(false);
                  handleResetBoard();
                  handleNavigate('home');
                }}
              />
            )}

            {activePage === 'contact' && (
              <ContactPage
                contactSettings={contactSettings}
                isAdmin={isAdmin}
                onNavigate={handleNavigate}
              />
            )}

            {activePage === 'my_lists' && (
              <MyQuestionListsPage
                user={user}
                mainCategories={mainCategories}
                subcategories={activeSubcategories}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onNavigateHome={() => handleNavigate('home')}
              />
            )}

            {activePage === 'online_multiplayer' && (
              <OnlineMultiplayerPage
                user={user}
                mainCategories={mainCategories}
                subcategories={activeSubcategories}
                approvedQuestions={approvedQuestions}
                onNavigateHome={() => handleNavigate('home')}
                onNavigate={handleNavigate}
                initialRoomCode={initialRoomCode}
              />
            )}

            {activePage === 'admin' &&
              (isAdmin ? (
                <AdminDashboardPage
                  user={user}
                  isAdmin={isAdmin}
                  authLoading={authLoading}
                  questions={allQuestions}
                  mainCategories={mainCategories}
                  subcategories={subcategories}
                  contactSettings={contactSettings}
                  loadingQuestions={loadingQuestions}
                  onLoginGoogle={handleGoogleLogin}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                  onLogout={handleLogout}
                  onRefreshQuestions={async () => {
                    await loadQuestions(isAdmin);
                  }}
                  onRefreshMainCategories={async () => {
                    const mains = await loadMainCategories();
                    await loadSubcategories(isAdmin, mains);
                  }}
                  onRefreshSubcategories={async () => {
                    await loadSubcategories(isAdmin);
                  }}
                  onRefreshContactSettings={async () => {
                    await loadContactSettings();
                  }}
                  onSeedFoundationalPack={handleSeedFoundationalPack}
                  seeding={seeding}
                />
              ) : (
                <HomePage
                  onStartCategorySelection={() => handleNavigate('categories')}
                  onNavigate={handleNavigate}
                />
              ))}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer
        brandName={brandName}
        onUpdateBrandName={handleUpdateBrandName}
        onNavigate={handleNavigate}
        isAdmin={isAdmin}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}
