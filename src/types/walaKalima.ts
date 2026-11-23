import type { DifficultyLevel, PointValue } from './game.ts';

export const WALA_KALIMA_MAIN_CATEGORY_ID = 'main-wala-kalima';
export const WALA_KALIMA_MAIN_CATEGORY_NAME = 'ولا كلمة';
export const WALA_KALIMA_LEGACY_MAIN_ID = 'main-1793867682734-xevr';

export interface WalaKalimaPointLevelMeta {
  level: 1 | 2 | 3 | 4 | 5;
  levelLabel: string;
  points: PointValue;
  difficulty: DifficultyLevel;
}

export const WALA_KALIMA_POINT_LEVELS: ReadonlyArray<WalaKalimaPointLevelMeta> = [
  { level: 1, levelLabel: 'المستوى الأول', points: 100, difficulty: 'سهل' },
  { level: 2, levelLabel: 'المستوى الثاني', points: 200, difficulty: 'متوسط' },
  { level: 3, levelLabel: 'المستوى الثالث', points: 300, difficulty: 'صعب' },
  { level: 4, levelLabel: 'المستوى الرابع', points: 400, difficulty: 'صعب جداً' },
  { level: 5, levelLabel: 'المستوى الخامس', points: 500, difficulty: 'خبير' },
];

export function isValidWalaKalimaPointLevel(value: unknown): value is PointValue {
  const num = Number(value);
  return num === 100 || num === 200 || num === 300 || num === 400 || num === 500;
}

export function getWalaKalimaPointLevelMeta(points?: number | null): WalaKalimaPointLevelMeta {
  return (
    WALA_KALIMA_POINT_LEVELS.find((item) => item.points === Number(points)) ||
    WALA_KALIMA_POINT_LEVELS[0]
  );
}

export type WalaKalimaContentTypeId =
  | 'football_players'
  | 'anime_characters'
  | 'movies_series_characters'
  | 'general_info'
  | 'countries_cities'
  | 'animals'
  | 'islamic_figures'
  | 'brands_companies'
  | 'objects_tools'
  | 'sports_games'
  | 'inventions_science';

export interface WalaKalimaContentTypeMeta {
  id: WalaKalimaContentTypeId;
  label: string;
  subcategoryId: string;
  subcategoryName: string;
  description: string;
}

export const WALA_KALIMA_CONTENT_TYPES: WalaKalimaContentTypeMeta[] = [
  {
    id: 'football_players',
    label: 'لاعبو كرة القدم',
    subcategoryId: 'sub-wk-football-players',
    subcategoryName: 'لاعبو كرة القدم',
    description: 'نجوم الملاعب العالمية والعربية والسعودية بالتمثيل الصامت والحركات الشهيرة بدون كلام.',
  },
  {
    id: 'anime_characters',
    label: 'شخصيات الأنمي',
    subcategoryId: 'sub-wk-anime-characters',
    subcategoryName: 'شخصيات الأنمي',
    description: 'أشهر أبطال وخصوم عالم الأنمي عبر الحركات والإشارات والوضعيات الشهيرة دون كلام.',
  },
  {
    id: 'movies_series_characters',
    label: 'شخصيات الأفلام والمسلسلات',
    subcategoryId: 'sub-wk-movies-series-characters',
    subcategoryName: 'شخصيات الأفلام والمسلسلات',
    description: 'شخصيات سينمائية وتلفزيونية أيقونية من الأعمال العربية والعالمية بالتمثيل الصامت.',
  },
  {
    id: 'general_info',
    label: 'معلومات عامة',
    subcategoryId: 'sub-wk-general-info',
    subcategoryName: 'معلومات عامة (ولا كلمة)',
    description: 'مفاهيم ومواقف وظواهر متنوعة تُؤدى بالتمثيل الصامت خلال 45 ثانية.',
  },
  {
    id: 'countries_cities',
    label: 'دول ومدن',
    subcategoryId: 'sub-wk-countries-cities',
    subcategoryName: 'دول ومدن',
    description: 'عواصم ودول ومعالم جغرافية مشهورة حول العالم عبر الإشارات والحركات فقط.',
  },
  {
    id: 'animals',
    label: 'حيوانات',
    subcategoryId: 'sub-wk-animals',
    subcategoryName: 'حيوانات',
    description: 'كائنات برية وبحرية وطيور بأسلوب التمثيل الصامت وتعبيرات الجسد.',
  },
  {
    id: 'islamic_figures',
    label: 'شخصيات إسلامية',
    subcategoryId: 'sub-wk-islamic-figures',
    subcategoryName: 'شخصيات إسلامية',
    description: 'صحابة وعلماء وقادة بارزون في التاريخ الإسلامي بأسلوب هادف وممتع دون كلام.',
  },
  {
    id: 'brands_companies',
    label: 'شركات وعلامات تجارية',
    subcategoryId: 'sub-wk-brands-companies',
    subcategoryName: 'شركات وعلامات تجارية',
    description: 'علامات تجارية وشركات تقنية وعالمية ومحلية شهيرة بالتمثيل الإيمائي.',
  },
  {
    id: 'objects_tools',
    label: 'أشياء وأدوات',
    subcategoryId: 'sub-wk-objects-tools',
    subcategoryName: 'أشياء وأدوات',
    description: 'أغراض يومية وأدوات منزلية وتقنية في تحدي التمثيل الصامت الدقيق.',
  },
  {
    id: 'sports_games',
    label: 'رياضات وألعاب',
    subcategoryId: 'sub-wk-sports-games',
    subcategoryName: 'رياضات وألعاب',
    description: 'رياضات أولمبية وشعبية وألعاب معروفة عبر الحركات الرياضية الصامتة.',
  },
  {
    id: 'inventions_science',
    label: 'اختراعات وعلوم',
    subcategoryId: 'sub-wk-inventions-science',
    subcategoryName: 'اختراعات وعلوم',
    description: 'ابتكارات غيرت التاريخ وظواهر علمية مشهورة بالتمثيل الصامت.',
  },
];

export interface WalaKalimaSettings {
  enabled: boolean;
  timerSeconds: number;
  maxSkips: number;
  wordsPerRound: number;
  pointsPerCorrectWord: number;
  enabledContentTypes: WalaKalimaContentTypeId[];
  updatedAt?: string;
}

export const DEFAULT_WALA_KALIMA_SETTINGS: WalaKalimaSettings = {
  enabled: true,
  timerSeconds: 45,
  maxSkips: 3,
  wordsPerRound: 4,
  pointsPerCorrectWord: 100,
  enabledContentTypes: WALA_KALIMA_CONTENT_TYPES.map((ct) => ct.id),
};

export interface WalaKalimaWordEntry {
  id: string;
  word: string;
  forbiddenWords?: string[];
  contentType: WalaKalimaContentTypeId;
  difficulty: DifficultyLevel;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type WalaKalimaSessionStatus =
  | 'waiting_scan'
  | 'active'
  | 'finished'
  | 'expired'
  | 'cancelled';

export type WalaKalimaEndReason =
  | 'correct_guess'
  | 'time_up'
  | 'completed_all'
  | 'player_finished'
  | 'host_ended'
  | null;

/**
 * Safe public status returned to the Match Screen (NEVER contains secret words).
 */
export interface WalaKalimaSessionPublicStatus {
  sessionId: string;
  matchId: string;
  tileKey: string;
  teamId: string;
  teamName: string;
  playerName: string;
  contentType: WalaKalimaContentTypeId;
  contentTypeLabel: string;
  status: WalaKalimaSessionStatus;
  timerSeconds: number;
  remainingSeconds: number;
  serverNow: number;
  startedAt: number | null;
  expiresAt: number | null;
  totalWords: number;
  currentIndex: number;
  correctCount: number;
  skippedCount: number;
  maxSkips: number;
  remainingSkips: number;
  pointsPerCorrectWord: number;
  earnedPoints: number;
  endReason?: WalaKalimaEndReason;
}

export interface WalaKalimaCreateSessionResponse extends WalaKalimaSessionPublicStatus {
  hostSecret: string;
  qrPath: string;
}

/**
 * Private payload returned ONLY to the single authorized player phone after QR claim.
 */
export interface WalaKalimaPlayerActiveWord {
  word: string;
  contentType: WalaKalimaContentTypeId;
  contentTypeLabel: string;
  difficulty: DifficultyLevel;
  points?: PointValue;
}

export interface WalaKalimaPlayerSessionState {
  sessionId: string;
  playerToken: string;
  matchId: string;
  teamId: string;
  teamName: string;
  playerName: string;
  contentType: WalaKalimaContentTypeId;
  contentTypeLabel: string;
  status: WalaKalimaSessionStatus;
  timerSeconds: number;
  remainingSeconds: number;
  serverNow: number;
  startedAt: number | null;
  expiresAt: number | null;
  totalWords: number;
  currentIndex: number;
  correctCount: number;
  skippedCount: number;
  maxSkips: number;
  remainingSkips: number;
  pointsPerCorrectWord: number;
  earnedPoints: number;
  endReason?: WalaKalimaEndReason;
  activeWord: WalaKalimaPlayerActiveWord | null;
}

const WALA_KALIMA_SUB_ID_SET = new Set<string>(
  WALA_KALIMA_CONTENT_TYPES.map((ct) => ct.subcategoryId)
);

const WALA_KALIMA_SUB_NAME_SET = new Set<string>(
  WALA_KALIMA_CONTENT_TYPES.flatMap((ct) => [ct.subcategoryName, ct.label])
);

export function isWalaKalimaCategory(params: {
  subcategoryId?: string | null;
  subcategoryName?: string | null;
  mainCategoryId?: string | null;
  mainCategoryName?: string | null;
}): boolean {
  const subId = (params.subcategoryId || '').trim();
  const subName = (params.subcategoryName || '').trim();
  const mainId = (params.mainCategoryId || '').trim();
  const mainName = (params.mainCategoryName || '').trim();

  if (
    mainId === WALA_KALIMA_MAIN_CATEGORY_ID ||
    mainId === WALA_KALIMA_LEGACY_MAIN_ID ||
    mainName === WALA_KALIMA_MAIN_CATEGORY_NAME
  ) {
    return true;
  }
  if (subId && (WALA_KALIMA_SUB_ID_SET.has(subId) || subId.startsWith('sub-wk-'))) {
    return true;
  }
  if (subName === WALA_KALIMA_MAIN_CATEGORY_NAME || subName === 'معلومات عامة (ولا كلمة)') {
    return true;
  }
  // Unique non-colliding WK names
  if (
    subName &&
    subName !== 'معلومات عامة' &&
    WALA_KALIMA_SUB_NAME_SET.has(subName)
  ) {
    return true;
  }
  return false;
}

export function resolveWalaKalimaContentType(params: {
  subcategoryId?: string | null;
  subcategoryName?: string | null;
}): WalaKalimaContentTypeMeta {
  const subId = (params.subcategoryId || '').trim();
  const subName = (params.subcategoryName || '').trim();

  const byId = WALA_KALIMA_CONTENT_TYPES.find((ct) => ct.subcategoryId === subId);
  if (byId) return byId;

  const byExactName = WALA_KALIMA_CONTENT_TYPES.find(
    (ct) => ct.subcategoryName === subName || ct.label === subName || ct.id === subName
  );
  if (byExactName) return byExactName;

  return WALA_KALIMA_CONTENT_TYPES[0];
}
