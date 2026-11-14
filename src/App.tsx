import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
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
  QuestionDedupSettings,
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
import { DEFAULT_QUESTION_DEDUP_SETTINGS } from './utils/questionDedupLogic';
import {
  fetchQuestionDedupSettingsFromFirestore,
  flushPendingSeenQuestions,
  recordQuestionSeenForUser,
  subscribeToUserSeenQuestions,
} from './services/seenQuestionsService';
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
const MyMatchesPage = lazy(() =>
  import('./pages/MyMatchesPage').then((m) => ({
    default: m.MyMatchesPage,
  }))
);
const FriendsPage = lazy(() =>
  import('./pages/FriendsPage').then((m) => ({
    default: m.FriendsPage,
  }))
);
const HowToPlayPage = lazy(() =>
  import('./pages/HowToPlayPage').then((m) => ({
    default: m.HowToPlayPage,
  }))
);
import { ResumeMatchModal } from './components/ResumeMatchModal';
import { UserGameMatch } from './types/match';
import {
  saveMatchProgressToFirestore,
  fetchActiveIncompleteMatch,
  markMatchAbandoned,
  markMatchCompleted,
  generateMatchId,
} from './services/matchService';
import { soundFX } from './services/soundEffects';
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  markPresenceOfflineNow,
  refreshCachedAuthToken,
  sendOfflineKeepaliveBeacon,
  sendPresenceHeartbeat,
  setExplicitPresence,
  syncPublicPlayerProfile,
} from './services/presenceService';
import { PresenceStatus } from './types/social';

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
  'my_matches',
  'friends',
  'how_to_play',
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

  const [initialJoinRole, setInitialJoinRole] = useState<'player' | 'spectator'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('role') === 'spectator' ? 'spectator' : 'player';
    } catch {
      return 'player';
    }
  });
  const [autoJoinNonce, setAutoJoinNonce] = useState<number>(0);

  const [onlineActivity, setOnlineActivity] = useState<{
    status: 'online' | 'in_lobby' | 'in_match';
    roomCode: string | null;
  }>({ status: 'online', roomCode: null });

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

  // Mandatory Login Target & Resume Match State
  const [pendingPlayTarget, setPendingPlayTarget] = useState<PageView | null>(
    null
  );
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [incompleteMatch, setIncompleteMatch] =
    useState<UserGameMatch | null>(null);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState<boolean>(false);
  const [activeQuestionSaved, setActiveQuestionSaved] = useState<any | null>(
    null
  );

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
  const [questionDedupSettings, setQuestionDedupSettings] =
    useState<QuestionDedupSettings>(DEFAULT_QUESTION_DEDUP_SETTINGS);
  const [seenQuestionIds, setSeenQuestionIds] = useState<Set<string>>(
    () => new Set()
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
  // Synchronous ref preventing duplicate point awards on rapid clicks or race conditions
  const resolvedTileKeysRef = useRef<Set<string>>(new Set(usedTileKeys));
  useEffect(() => {
    resolvedTileKeysRef.current = new Set(usedTileKeys);
  }, [usedTileKeys]);

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

  // Playable subcategories exclude any Coming Soon main categories or subcategories
  const playableSubcategories = useMemo(() => {
    const comingSoonMainIds = new Set(
      mainCategories
        .filter((m) => m.isComingSoon)
        .map((m) => m.id)
    );
    const comingSoonMainNames = new Set(
      mainCategories
        .filter((m) => m.isComingSoon)
        .map((m) => m.name)
    );
    return activeSubcategories.filter(
      (s) =>
        !s.isComingSoon &&
        !(s.mainCategoryId && comingSoonMainIds.has(s.mainCategoryId)) &&
        !comingSoonMainNames.has(s.mainCategory)
    );
  }, [activeSubcategories, mainCategories]);

  // Keep teamSubcategoryIds synchronized and deduplicated whenever teams or playableSubcategories change
  useEffect(() => {
    if (!categoriesLoaded || playableSubcategories.length === 0) return;

    setTeamSubcategoryIds((prev) => {
      const sanitized = sanitizeTeamSubcategoryPicks(
        prev,
        teams,
        playableSubcategories
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
  }, [categoriesLoaded, playableSubcategories, teams]);

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

  // Load Question Deduplication settings from Firestore
  const loadQuestionDedupSettings = useCallback(async (forceRefresh = false) => {
    try {
      const settings = await fetchQuestionDedupSettingsFromFirestore(
        forceRefresh
      );
      setQuestionDedupSettings(settings);
      return settings;
    } catch (err) {
      console.error(
        'Failed to load question dedup settings from Firestore:',
        err
      );
      return DEFAULT_QUESTION_DEDUP_SETTINGS;
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      const adminStatus = await checkUserIsAdmin(currentUser);
      setIsAdmin(adminStatus);
      setAuthLoading(false);

      if (currentUser) {
        syncPublicPlayerProfile(currentUser).catch(() => {});
      }

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
        loadQuestionDedupSettings(),
      ]);
      setCategoriesLoaded(true);

      // Check if user has an unfinished active match from a previous session
      if (currentUser) {
        try {
          const match = await fetchActiveIncompleteMatch(currentUser.uid);
          if (match && match.status === 'in_progress') {
            setIncompleteMatch(match);
            setIsResumeModalOpen(true);
          }
        } catch (err) {
          console.warn('Could not check incomplete matches:', err);
        }
      }

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
    loadQuestionDedupSettings,
  ]);

  // Persistent per-UID seen questions real-time subscription + offline retry flush
  useEffect(() => {
    if (!user?.uid) {
      setSeenQuestionIds(new Set());
      return;
    }

    const uid = user.uid;
    flushPendingSeenQuestions(uid).catch(() => {});

    const unsubSeen = subscribeToUserSeenQuestions(uid, (ids) => {
      setSeenQuestionIds(new Set(ids));
    });

    const handleOnlineFlush = () => {
      flushPendingSeenQuestions(uid).catch(() => {});
    };
    window.addEventListener('online', handleOnlineFlush);

    return () => {
      unsubSeen();
      window.removeEventListener('online', handleOnlineFlush);
    };
  }, [user?.uid]);

  const handleRecordQuestionSeen = useCallback(
    async (params: {
      questionId: string;
      category: string;
      subcategoryId?: string;
      mode: 'local' | 'online';
      displayKey?: string;
    }) => {
      if (!user?.uid || !params.questionId) return;
      await recordQuestionSeenForUser({
        uid: user.uid,
        questionId: params.questionId,
        category: params.category,
        subcategoryId: params.subcategoryId,
        mode: params.mode,
        displayKey: params.displayKey,
      });
    },
    [user?.uid]
  );

  // Global Hybrid Real-time Presence Lifecycle
  // Uses explicit state transitions + tab-close keepalive beacon + network status + heartbeat safety net
  const effectivePresenceStatus: Exclude<PresenceStatus, 'offline'> = useMemo(() => {
    if (activePage === 'online_multiplayer') {
      return onlineActivity.status;
    }
    if (activePage === 'board') {
      return 'in_match';
    }
    return 'online';
  }, [activePage, onlineActivity.status]);

  const effectivePresenceRoomCode =
    activePage === 'online_multiplayer' ? onlineActivity.roomCode : null;

  useEffect(() => {
    if (!user) return;
    void setExplicitPresence(user, effectivePresenceStatus, effectivePresenceRoomCode);
  }, [user, effectivePresenceStatus, effectivePresenceRoomCode]);

  useEffect(() => {
    if (!user) return;
    void refreshCachedAuthToken(user);

    const handlePageExit = () => {
      sendOfflineKeepaliveBeacon(user.uid);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void setExplicitPresence(user, effectivePresenceStatus, effectivePresenceRoomCode);
      }
    };
    const handleNetworkOffline = () => {
      void markPresenceOfflineNow(user.uid);
    };
    const handleNetworkOnline = () => {
      void setExplicitPresence(user, effectivePresenceStatus, effectivePresenceRoomCode);
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('offline', handleNetworkOffline);
    window.addEventListener('online', handleNetworkOnline);

    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sendPresenceHeartbeat(user);
      }
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('offline', handleNetworkOffline);
      window.removeEventListener('online', handleNetworkOnline);
      window.clearInterval(heartbeatTimer);
    };
  }, [user, effectivePresenceStatus, effectivePresenceRoomCode]);

  const handlePresenceActivityChange = useCallback(
    (status: 'online' | 'in_lobby' | 'in_match', roomCode?: string | null) => {
      setOnlineActivity({ status, roomCode: roomCode || null });
    },
    []
  );

  const handleJoinRoomFromInvite = useCallback(
    (roomCode: string, role: 'player' | 'spectator') => {
      setInitialRoomCode(roomCode.trim().toUpperCase());
      setInitialJoinRole(role);
      setAutoJoinNonce((n) => n + 1);
      setActivePage('online_multiplayer');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

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

  const autoSaveMatch = useCallback(
    async (overrides?: Partial<UserGameMatch>) => {
      if (!user) return;
      const matchId = overrides?.id || currentMatchId || generateMatchId();
      if (!currentMatchId) {
        setCurrentMatchId(matchId);
      }

      const title =
        overrides?.matchTitle ||
        (teams && teams.length >= 2
          ? `${teams[0].name} ضد ${teams[1].name}`
          : 'مباراة نِزال');

      const payload: UserGameMatch = {
        id: matchId,
        userId: user.uid,
        userEmail: user.email || null,
        userName: user.displayName || null,
        matchTitle: title,
        status: 'in_progress',
        mode: 'local',
        teams,
        teamSubcategoryIds,
        selectedSubcategories,
        orderedTeamSelections,
        activeTeamIndex,
        usedTileKeys,
        roundUsedQuestionIds,
        timerDuration,
        isGameLocked,
        activePage,
        activeQuestionState: activeQuestionSaved,
        totalQuestionsPlayed: usedTileKeys.length,
        updatedAt: Date.now(),
        ...overrides,
      };

      try {
        await saveMatchProgressToFirestore(payload);
      } catch (err) {
        console.warn('Auto-save match progress error:', err);
      }
    },
    [
      user,
      currentMatchId,
      teams,
      teamSubcategoryIds,
      selectedSubcategories,
      orderedTeamSelections,
      activeTeamIndex,
      usedTileKeys,
      roundUsedQuestionIds,
      timerDuration,
      isGameLocked,
      activePage,
      activeQuestionSaved,
    ]
  );

  // Periodic auto-save to Firestore every 30 seconds if game is locked and user is signed in
  useEffect(() => {
    if (!user || !isGameLocked || !currentMatchId || activePage === 'results') return;

    const interval = setInterval(() => {
      autoSaveMatch();
    }, 30000);

    const handleBeforeUnload = () => {
      autoSaveMatch();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, isGameLocked, currentMatchId, activePage, autoSaveMatch]);

  const handleNavigate = (page: PageView) => {
    // 1. Mandatory Sign-in: require user authentication for playing or managing matches
    const protectedPages: PageView[] = [
      'categories',
      'setup',
      'board',
      'online_multiplayer',
      'my_matches',
      'my_lists',
      'friends',
    ];

    if (!user && protectedPages.includes(page)) {
      if (isGameLocked && (page === 'board' || page === 'categories' || page === 'setup')) {
        // Allow ongoing active game session to continue without interruption
      } else {
        setPendingPlayTarget(page);
        setIsAuthModalOpen(true);
        return;
      }
    }

    if (page === 'categories') {
      setInitialMainCategoryId(null);
    }

    // Never block returning to board if the game is already in progress / locked!
    if (page === 'board' && !isGameLocked && !isAllTeamsSelectionComplete) {
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

  const handleResumeIncompleteMatch = (matchToResume: UserGameMatch) => {
    if (!matchToResume) {
      alert('تعذر استعادة المباراة: بيانات هذه المباراة غير مكتملة.');
      return;
    }

    // 1. Online match: transition immediately to online multiplayer room
    if (matchToResume.mode === 'online' && matchToResume.roomCode) {
      setInitialRoomCode(matchToResume.roomCode);
      setIsResumeModalOpen(false);
      setIncompleteMatch(null);
      setActivePage('online_multiplayer');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 2. Local match: validate teams and restore state to game board
    if (!Array.isArray(matchToResume.teams) || matchToResume.teams.length < 2) {
      alert('تعذر استعادة المباراة: بيانات هذه المباراة غير مكتملة.');
      return;
    }

    setCurrentMatchId(matchToResume.id);
    if (Array.isArray(matchToResume.teams) && matchToResume.teams.length >= 2) {
      setTeams(matchToResume.teams);
    }
    if (matchToResume.teamSubcategoryIds) {
      setTeamSubcategoryIds(matchToResume.teamSubcategoryIds);
    }
    if (typeof matchToResume.activeTeamIndex === 'number') {
      setActiveTeamIndex(matchToResume.activeTeamIndex);
    }
    if (Array.isArray(matchToResume.usedTileKeys)) {
      resolvedTileKeysRef.current = new Set(matchToResume.usedTileKeys);
      setUsedTileKeys(matchToResume.usedTileKeys);
    }
    if (Array.isArray(matchToResume.roundUsedQuestionIds)) {
      setRoundUsedQuestionIds(matchToResume.roundUsedQuestionIds);
    }
    if (typeof matchToResume.timerDuration === 'number') {
      setTimerDuration(matchToResume.timerDuration);
    }
    setIsGameLocked(true);

    if (matchToResume.activeQuestionState?.tileKey) {
      const qState = matchToResume.activeQuestionState;
      const restoredModalData = {
        activeSelection: {
          tileKey: qState.tileKey,
          subcategoryId: qState.subcategoryId,
          subcategoryName: qState.subcategoryName,
          mainCategoryName: qState.mainCategoryName,
          points: qState.points,
          question: {
            id: qState.questionId,
            questionText: qState.questionText,
            correctAnswer: qState.correctAnswer,
            mediaType: qState.mediaType,
            imageUrl: qState.imageUrl,
            imageDescription: qState.imageDescription,
            audioUrl: qState.audioUrl,
            audioMaxPlays: qState.audioMaxPlays ?? null,
            explanation: qState.explanation,
            points: qState.points,
            mainCategory: qState.mainCategoryName,
            subcategory: qState.subcategoryName,
            subcategoryId: qState.subcategoryId,
            type: 'direct',
          },
        },
        answerRevealed: Boolean(qState.answerRevealed),
        timeLeft:
          typeof qState.timeLeft === 'number'
            ? qState.timeLeft
            : matchToResume.timerDuration || 60,
        timerPaused: Boolean(qState.timerPaused),
        audioPlaysUsed:
          typeof qState.audioPlaysUsed === 'number' ? qState.audioPlaysUsed : 0,
      };
      try {
        localStorage.setItem(
          'nizal_active_question_modal_v1',
          JSON.stringify(restoredModalData)
        );
      } catch {
        // ignore
      }
      setActiveQuestionSaved(qState);
    } else {
      try {
        localStorage.removeItem('nizal_active_question_modal_v1');
      } catch {
        // ignore
      }
      setActiveQuestionSaved(null);
    }

    setIsResumeModalOpen(false);
    setIncompleteMatch(null);
    const targetPage: PageView =
      matchToResume.activePage === 'results' ? 'results' : 'board';
    setActivePage(targetPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartNewGameFromResumeModal = async () => {
    if (incompleteMatch && user) {
      try {
        await markMatchAbandoned(incompleteMatch.id, user.uid);
      } catch (err) {
        console.warn('Failed to mark previous match abandoned:', err);
      }
    }
    clearModalLocalStorage();
    setIsResumeModalOpen(false);
    setIncompleteMatch(null);
    const freshId = generateMatchId();
    setCurrentMatchId(freshId);
    setIsGameLocked(false);
    resolvedTileKeysRef.current = new Set();
    setUsedTileKeys([]);
    setRoundUsedQuestionIds([]);
    setTeams((prev) => prev.map((t) => ({ ...t, score: 0 })));
    setActivePage('categories');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Game Board Handlers
  const handleStartGameFromSetup = () => {
    if (!user) {
      setPendingPlayTarget('setup');
      setIsAuthModalOpen(true);
      return;
    }

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
    const updatedTeams = teams.map((t, idx) => ({
      ...t,
      name: t.name.trim() || `الفريق ${idx + 1}`,
      score: 0,
    }));
    setTeams(updatedTeams);
    resolvedTileKeysRef.current = new Set();
    setUsedTileKeys([]);
    setRoundUsedQuestionIds([]);
    setActiveTeamIndex(0);
    setActiveQuestionSaved(null);

    const freshMatchId = generateMatchId();
    setCurrentMatchId(freshMatchId);
    autoSaveMatch({
      id: freshMatchId,
      status: 'in_progress',
      mode: 'local',
      teams: updatedTeams,
      usedTileKeys: [],
      roundUsedQuestionIds: [],
      activeTeamIndex: 0,
      activePage: 'board',
      activeQuestionState: null,
      isGameLocked: true,
    });

    soundFX.playChallengeStart();
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
    // Synchronous + state idempotency guard: strictly prevent double scoring for the same tile
    if (resolvedTileKeysRef.current.has(tileKey) || usedTileKeys.includes(tileKey)) {
      return;
    }
    resolvedTileKeysRef.current.add(tileKey);

    const safeIndex =
      teamIndex >= 0 && teamIndex < teams.length ? teamIndex : 0;
    const nextTeams = teams.map((t, idx) =>
      idx === safeIndex ? { ...t, score: t.score + points } : t
    );
    setTeams(nextTeams);

    const nextUsedTiles = [...usedTileKeys, tileKey];
    setUsedTileKeys(nextUsedTiles);
    const nextRoundUsed = roundUsedQuestionIds.includes(questionId)
      ? roundUsedQuestionIds
      : [...roundUsedQuestionIds, questionId];
    setRoundUsedQuestionIds(nextRoundUsed);
    setUsedQuestionIds((prev) =>
      prev.includes(questionId) ? prev : [...prev, questionId]
    );
    const nextTeamIdx =
      nextTeams.length > 0 ? (activeTeamIndex + 1) % nextTeams.length : 0;
    setActiveTeamIndex(nextTeamIdx);
    setActiveQuestionSaved(null);

    const targetTotal =
      typeof playableTilesCount === 'number' && playableTilesCount > 0
        ? playableTilesCount
        : defaultTotalBoardTiles;

    const isMatchFinished = nextUsedTiles.length >= targetTotal;
    const sorted = [...nextTeams].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    autoSaveMatch({
      teams: nextTeams,
      usedTileKeys: nextUsedTiles,
      roundUsedQuestionIds: nextRoundUsed,
      activeTeamIndex: nextTeamIdx,
      status: isMatchFinished ? 'completed' : 'in_progress',
      winnerTeamName: isMatchFinished ? winner?.name : undefined,
      winnerScore: isMatchFinished ? winner?.score : undefined,
      activeQuestionState: null,
      activePage: isMatchFinished ? 'results' : 'board',
    });

    if (isMatchFinished) {
      recordGameSessionInFirestore({
        teams: nextTeams,
        selectedSubcategories,
        totalQuestionsPlayed: nextUsedTiles.length,
        winnerTeamName: winner ? winner.name : '',
        winnerScore: winner ? winner.score : 0,
        userId: user?.uid || null,
      }).catch(() => {});

      soundFX.playMatchWin();
      setActivePage('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleMarkTileUsedNoPoints = (
    tileKey: string,
    questionId: string,
    playableTilesCount?: number
  ) => {
    // Synchronous + state idempotency guard: prevent marking the same tile used twice
    if (resolvedTileKeysRef.current.has(tileKey) || usedTileKeys.includes(tileKey)) {
      return;
    }
    resolvedTileKeysRef.current.add(tileKey);

    const nextUsedTiles = [...usedTileKeys, tileKey];
    setUsedTileKeys(nextUsedTiles);
    const nextRoundUsed = roundUsedQuestionIds.includes(questionId)
      ? roundUsedQuestionIds
      : [...roundUsedQuestionIds, questionId];
    setRoundUsedQuestionIds(nextRoundUsed);
    setUsedQuestionIds((prev) =>
      prev.includes(questionId) ? prev : [...prev, questionId]
    );
    const nextTeamIdx =
      teams.length > 0 ? (activeTeamIndex + 1) % teams.length : 0;
    setActiveTeamIndex(nextTeamIdx);
    setActiveQuestionSaved(null);

    const targetTotal =
      typeof playableTilesCount === 'number' && playableTilesCount > 0
        ? playableTilesCount
        : defaultTotalBoardTiles;

    const isMatchFinished = nextUsedTiles.length >= targetTotal;
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    autoSaveMatch({
      teams,
      usedTileKeys: nextUsedTiles,
      roundUsedQuestionIds: nextRoundUsed,
      activeTeamIndex: nextTeamIdx,
      status: isMatchFinished ? 'completed' : 'in_progress',
      winnerTeamName: isMatchFinished ? winner?.name : undefined,
      winnerScore: isMatchFinished ? winner?.score : undefined,
      activeQuestionState: null,
      activePage: isMatchFinished ? 'results' : 'board',
    });

    if (isMatchFinished) {
      recordGameSessionInFirestore({
        teams,
        selectedSubcategories,
        totalQuestionsPlayed: nextUsedTiles.length,
        winnerTeamName: winner ? winner.name : '',
        winnerScore: winner ? winner.score : 0,
        userId: user?.uid || null,
      }).catch(() => {});

      soundFX.playMatchWin();
      setActivePage('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleResetBoard = () => {
    clearModalLocalStorage();
    resolvedTileKeysRef.current = new Set();
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
        onJoinRoomFromInvite={handleJoinRoomFromInvite}
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

            {activePage === 'how_to_play' && (
              <HowToPlayPage
                onBackToHome={() => handleNavigate('home')}
                onStartLocalGame={() => handleNavigate('categories')}
                onStartOnlineGame={() => handleNavigate('online_multiplayer')}
              />
            )}

            {(activePage === 'categories' || activePage === 'setup') && (
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
                initialSection={activePage === 'setup' ? 'teams' : 'categories'}
                timerDuration={timerDuration}
                onUpdateTimer={setTimerDuration}
                approvedQuestionsCount={approvedQuestions.length}
                isAdmin={isAdmin}
                onSeedQuestions={handleSeedFoundationalPack}
                seeding={seeding}
                isGameLocked={isGameLocked}
                onBackToHome={() => handleNavigate('home')}
                onConfirmSelection={() => handleNavigate('setup')}
                onStartGameDirectly={handleStartGameFromSetup}
                onGoToBoard={() => handleNavigate('board')}
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
                userId={user?.uid || null}
                seenQuestionIds={seenQuestionIds}
                questionDedupSettings={questionDedupSettings}
                onRecordQuestionSeen={handleRecordQuestionSeen}
                onAwardPoints={handleAwardPoints}
                onMarkTileUsedNoPoints={handleMarkTileUsedNoPoints}
                onSelectTurn={setActiveTeamIndex}
                onFinishGame={() => {
                  soundFX.playMatchWin();
                  handleNavigate('results');
                }}
                onResetBoard={handleResetBoard}
                onGoToCategories={() => handleNavigate('categories')}
                onGoToSetup={() => handleNavigate('setup')}
                isAdmin={isAdmin}
                onSeedQuestions={handleSeedFoundationalPack}
                seeding={seeding}
                onActiveQuestionChange={(st) => {
                  setActiveQuestionSaved(st);
                  if (user && isGameLocked) {
                    autoSaveMatch({ activeQuestionState: st });
                  }
                }}
              />
            )}

            {activePage === 'results' && (
              <ResultsPage
                teams={teams}
                usedCount={usedTileKeys.length}
                onPlayAgainSameTeams={() => {
                  handleResetBoard();
                  soundFX.playChallengeStart();
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

            {activePage === 'my_matches' && (
              <MyMatchesPage
                user={user}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onResumeMatch={handleResumeIncompleteMatch}
                onNavigateHome={() => handleNavigate('home')}
              />
            )}

            {activePage === 'friends' && (
              <FriendsPage
                user={user}
                activeOnlineRoomCode={onlineActivity.roomCode}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onNavigateHome={() => handleNavigate('home')}
                onEnterRoom={handleJoinRoomFromInvite}
              />
            )}

            {activePage === 'online_multiplayer' && (
              <OnlineMultiplayerPage
                user={user}
                mainCategories={mainCategories}
                subcategories={activeSubcategories}
                approvedQuestions={approvedQuestions}
                seenQuestionIds={seenQuestionIds}
                questionDedupSettings={questionDedupSettings}
                onRecordQuestionSeen={handleRecordQuestionSeen}
                onNavigateHome={() => handleNavigate('home')}
                onNavigate={handleNavigate}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                initialRoomCode={initialRoomCode}
                initialJoinRole={initialJoinRole}
                autoJoinNonce={autoJoinNonce}
                onPresenceActivityChange={handlePresenceActivityChange}
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
                  questionDedupSettings={questionDedupSettings}
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
                  onRefreshQuestionDedupSettings={async () => {
                    await loadQuestionDedupSettings(true);
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
        contactSettings={contactSettings}
      />

      <ResumeMatchModal
        isOpen={isResumeModalOpen}
        match={incompleteMatch}
        onResume={() => {
          if (incompleteMatch) {
            handleResumeIncompleteMatch(incompleteMatch);
          }
        }}
        onStartNew={handleStartNewGameFromResumeModal}
        onClose={() => setIsResumeModalOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingPlayTarget(null);
        }}
        onSuccess={() => {
          setIsAuthModalOpen(false);
          if (pendingPlayTarget) {
            const target = pendingPlayTarget;
            setPendingPlayTarget(null);
            handleNavigate(target);
          }
        }}
      />
    </div>
  );
}
