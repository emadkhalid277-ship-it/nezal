import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  db,
  storage,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  ApprovalStatus,
  ContactSettings,
  DifficultyLevel,
  MainCategoryIconName,
  MainCategoryMeta,
  MainCategoryName,
  PointValue,
  QuestionMediaType,
  QuestionType,
  SubcategoryItem,
  TriviaQuestion,
} from '../types/game';
import {
  DEFAULT_SUBCATEGORIES,
  INITIAL_SEED_QUESTIONS,
  MAIN_CATEGORIES,
} from '../data/categoriesAndSeed';
import { ALL_EXPANDED_QUESTIONS } from '../data/questions';
import {
  ALLOWED_QUESTION_AUDIO_TYPES,
  ALLOWED_QUESTION_IMAGE_TYPES,
  inferQuestionMediaType,
  MAX_QUESTION_AUDIO_SIZE_BYTES,
  MAX_QUESTION_IMAGE_SIZE_BYTES,
  normalizeAudioMaxPlays,
  validateQuestionAudioFile,
  validateQuestionImageFile,
} from '../utils/questionMedia';

export {
  ALLOWED_QUESTION_AUDIO_TYPES,
  ALLOWED_QUESTION_IMAGE_TYPES,
  inferQuestionMediaType,
  MAX_QUESTION_AUDIO_SIZE_BYTES,
  MAX_QUESTION_IMAGE_SIZE_BYTES,
  normalizeAudioMaxPlays,
  validateQuestionAudioFile,
  validateQuestionImageFile,
};

const QUESTIONS_COLLECTION = 'questions';
const SUBCATEGORIES_COLLECTION = 'subcategories';
const MAIN_CATEGORIES_COLLECTION = 'mainCategories';
const SETTINGS_COLLECTION = 'settings';
const CONTACT_DOC_ID = 'contact';

// Explicitly removed Movies & TV Shows references so they never appear
export const REMOVED_MAIN_CATEGORY_IDS = new Set(['main-movies-series']);
export const REMOVED_MAIN_CATEGORY_NAMES = new Set(['مسلسلات وأفلام']);
export const REMOVED_SUBCATEGORY_IDS = new Set([
  'sub-movies-series-general',
  'sub-arabic-drama',
  'sub-cinema-characters',
]);
export const REMOVED_SUBCATEGORY_NAMES = new Set([
  'أفلام ومسلسلات عالمية',
  'مسلسلات وأفلام عربية',
  'خمن الشخصية أو الفيلم',
]);
const REMOVED_SEED_QUESTION_IDS = [
  'seed-mov-100',
  'seed-mov-200',
  'seed-mov-300',
  'seed-mov-400',
  'seed-mov-500',
];

const DEFAULT_MAIN_IDS = new Set(MAIN_CATEGORIES.map((m) => m.id));
const DEFAULT_SUB_IDS = new Set(DEFAULT_SUBCATEGORIES.map((s) => s.id));

export const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  id: CONTACT_DOC_ID,
  heading: 'حنا هنا لمساعدتك!',
  message:
    'يسعدنا في «نِزال» استقبال استفساراتكم وملاحظاتكم واقتراحاتكم في أي وقت. تواصلوا معنا مباشرة عبر القنوات التالية:',
  whatsappUrl: '',
  whatsappDisplay: '',
  emailAddress: '',
  twitterUrl: '',
  instagramUrl: '',
  tiktokUrl: '',
  snapchatUrl: '',
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes TTL

class ServiceCache {
  private memoryCache = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const memory = this.memoryCache.get(key);
    const now = Date.now();
    if (memory && now - memory.timestamp < CACHE_TTL_MS) {
      return memory.data as T;
    }
    try {
      const raw = sessionStorage.getItem(`nizal_cache_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (now - parsed.timestamp < CACHE_TTL_MS) {
          this.memoryCache.set(key, parsed);
          return parsed.data;
        }
      }
    } catch {
      // ignore storage access issues
    }
    return null;
  }

  set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    this.memoryCache.set(key, entry);
    try {
      sessionStorage.setItem(`nizal_cache_${key}`, JSON.stringify(entry));
    } catch {
      // ignore storage access issues
    }
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.memoryCache.clear();
      try {
        const keys = Object.keys(sessionStorage).filter((k) =>
          k.startsWith('nizal_cache_')
        );
        keys.forEach((k) => sessionStorage.removeItem(k));
      } catch {
        // ignore
      }
      return;
    }

    for (const k of Array.from(this.memoryCache.keys())) {
      if (k.startsWith(keyPrefix)) {
        this.memoryCache.delete(k);
      }
    }
    try {
      const keys = Object.keys(sessionStorage).filter((k) =>
        k.startsWith(`nizal_cache_${keyPrefix}`)
      );
      keys.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore
    }
  }
}

export const serviceCache = new ServiceCache();

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `item-${Date.now()}`;
}

function formatTimestamp(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  return new Date().toISOString();
}

function resolveMainCategoryIdByName(
  mainName: string,
  mainCategories: MainCategoryMeta[] = MAIN_CATEGORIES
): string {
  const trimmed = mainName.trim();
  const match = mainCategories.find((m) => m.name.trim() === trimmed);
  if (match) return match.id;
  if (trimmed === 'رياضة' || trimmed === 'رياضات') return 'main-sports';
  const defMatch = MAIN_CATEGORIES.find((m) => m.name.trim() === trimmed);
  return defMatch ? defMatch.id : 'main-general';
}

export function requiresMcqOptionsToMakeSense(
  questionText: string,
  correctAnswer: string
): boolean {
  const qText = (questionText || '').trim();
  const cAns = (correctAnswer || '').trim();
  if (!cAns || qText.length < 3) return true;
  return /(أي مما يلي|أيٌّ مما يلي|أي من التالي|من بين الخيارات|اختر من الخيارات|من الخيارات التالية|أي من الخيارات|أيّ من التالي)/.test(
    qText
  );
}

function mapDocToQuestion(
  id: string,
  data: Record<string, any>
): TriviaQuestion {
  const questionText = String(data.questionText || '');
  const correctAnswer = String(data.correctAnswer || '');
  const rawStatus = (data.status || 'approved') as ApprovalStatus;
  const needsReview = requiresMcqOptionsToMakeSense(
    questionText,
    correctAnswer
  );
  const effectiveStatus: ApprovalStatus =
    rawStatus === 'approved' && needsReview ? 'pending' : rawStatus;

  const rawImageUrl =
    typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
  // Strictly forbid Base64 data URLs inside question documents
  const safeImageUrl =
    rawImageUrl.startsWith('http://') || rawImageUrl.startsWith('https://')
      ? rawImageUrl
      : '';
  const safeStoragePath =
    typeof data.imageStoragePath === 'string'
      ? data.imageStoragePath.trim()
      : '';
  const safeImageDesc =
    typeof data.imageDescription === 'string'
      ? data.imageDescription.trim()
      : '';

  const rawAudioUrl =
    typeof data.audioUrl === 'string' ? data.audioUrl.trim() : '';
  const safeAudioUrl =
    rawAudioUrl.startsWith('http://') || rawAudioUrl.startsWith('https://')
      ? rawAudioUrl
      : '';
  const safeAudioStoragePath =
    typeof data.audioStoragePath === 'string'
      ? data.audioStoragePath.trim()
      : '';
  const safeAudioMaxPlays = normalizeAudioMaxPlays(data.audioMaxPlays);
  const resolvedMediaType = inferQuestionMediaType({
    mediaType: data.mediaType,
    audioUrl: safeAudioUrl,
    imageUrl: safeImageUrl,
  });

  return {
    id: data.id || id,
    subcategoryId:
      typeof data.subcategoryId === 'string' ? data.subcategoryId : undefined,
    category: String(data.category || ''),
    questionText,
    questionType: 'direct',
    mediaType: resolvedMediaType,
    difficulty: data.difficulty as DifficultyLevel,
    points: Number(data.points || 100) as PointValue,
    options: [],
    correctAnswer,
    explanation: String(data.explanation || ''),
    source: String(data.source || ''),
    status: effectiveStatus,
    imageUrl: safeImageUrl || undefined,
    imageStoragePath: safeStoragePath || undefined,
    imageDescription: safeImageDesc || undefined,
    audioUrl: safeAudioUrl || undefined,
    audioStoragePath: safeAudioStoragePath || undefined,
    audioMaxPlays: safeAudioMaxPlays,
    authorId: String(data.authorId || ''),
    createdAt: formatTimestamp(data.createdAt),
    reviewedAt: formatTimestamp(data.reviewedAt),
  };
}

function mapDocToSubcategory(
  id: string,
  data: Record<string, any>
): SubcategoryItem {
  const mainCatName = String(data.mainCategory || 'عام');
  const mainCatId =
    typeof data.mainCategoryId === 'string' && data.mainCategoryId.trim()
      ? data.mainCategoryId.trim()
      : resolveMainCategoryIdByName(mainCatName);

  return {
    id: data.id || id,
    name: String(data.name || ''),
    mainCategoryId: mainCatId,
    mainCategory: mainCatName,
    description: String(data.description || ''),
    sortOrder: Number(data.sortOrder ?? 1),
    isActive: data.isActive !== false,
    isComingSoon: data.isComingSoon === true,
    isDeleted: data.isDeleted === true,
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    authorId: String(data.authorId || ''),
    createdAt: formatTimestamp(data.createdAt),
    updatedAt: formatTimestamp(data.updatedAt),
  };
}

const LEGACY_SUBCATEGORY_NAME_UPGRADES: Record<string, string> = {
  'ترفيه وأنمي': 'أنمي عام',
  'ون بيس (One Piece)': 'ون بيس',
};

export function normalizeArabicCategoryName(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

// Strict 1-to-1 aliases between foundational seed question categories and renamed Firestore subcategories
const PRIMARY_CATEGORY_ALIASES: [string, string][] = [
  ['أنمي عام', 'ترفيه وأنمي'],
  ['ون بيس', 'ون بيس (One Piece)'],
  ['الطب والعلوم', 'علوم'],
  ['تطبيقات', 'تقنية'],
  ['كرة القدم', 'رياضة وكرة قدم'],
  ['جغرافيا', 'جغرافيا وتاريخ'],
  ['العاب عامة', 'ألعاب الفيديو والبلايستيشن'],
  ['القران الكريم', 'القرآن الكريم وعلومه'],
  ['السيرة النبوية', 'السيرة النبوية وقصص الأنبياء'],
  ['الصحابة', 'الصحابة والتاريخ الإسلامي'],
  ['دول وعواصم', 'عواصم ودول العالم'],
  ['اعلام', 'أعلام ومعالم الدول'],
  ['كرة القدم السعودية', 'الدوري السعودي والمنتخب'],
  ['فورملا ون', 'الفورمولا 1 والسباقات'],
  ['فيفا', 'فيفا والألعاب التنافسية'],
  ['كرة السلة', 'الرياضات الأولمبية والعالمية'],
];

export function matchesSubcategoryQuestion(
  questionCategory: string,
  targetSubcategory: string,
  questionSubcategoryId?: string,
  targetSubcategoryId?: string
): boolean {
  if (
    questionSubcategoryId &&
    targetSubcategoryId &&
    questionSubcategoryId === targetSubcategoryId
  ) {
    return true;
  }
  const qRaw = questionCategory.trim();
  const tRaw = targetSubcategory.trim();
  if (!qRaw || !tRaw) return false;
  if (qRaw === tRaw) return true;

  const qNorm = normalizeArabicCategoryName(qRaw);
  const tNorm = normalizeArabicCategoryName(tRaw);
  if (qNorm === tNorm) return true;

  for (const [a, b] of PRIMARY_CATEGORY_ALIASES) {
    const aNorm = normalizeArabicCategoryName(a);
    const bNorm = normalizeArabicCategoryName(b);
    if (
      (qNorm === aNorm && tNorm === bNorm) ||
      (qNorm === bNorm && tNorm === aNorm)
    ) {
      return true;
    }
  }

  return false;
}

// Merge Firestore subcategories with DEFAULT_SUBCATEGORIES while respecting deleted & removed items
export function mergeSubcategories(
  firestoreSubs: SubcategoryItem[],
  mainCategories: MainCategoryMeta[] = MAIN_CATEGORIES
): SubcategoryItem[] {
  const byId = new Map<string, SubcategoryItem>();
  const mainById = new Map<string, MainCategoryMeta>();
  const mainByName = new Map<string, MainCategoryMeta>();

  mainCategories.forEach((m) => {
    mainById.set(m.id, m);
    mainByName.set(m.name.trim(), m);
    if (m.id === 'main-sports') {
      mainByName.set('رياضة', m);
      mainByName.set('رياضات', m);
    }
  });

  // Only seed with static DEFAULT_SUBCATEGORIES if Firestore subcategories collection is completely empty
  if (firestoreSubs.length === 0) {
    for (const def of DEFAULT_SUBCATEGORIES) {
      if (
        REMOVED_SUBCATEGORY_IDS.has(def.id) ||
        REMOVED_SUBCATEGORY_NAMES.has(def.name) ||
        REMOVED_MAIN_CATEGORY_IDS.has(def.mainCategoryId) ||
        REMOVED_MAIN_CATEGORY_NAMES.has(def.mainCategory)
      ) {
        continue;
      }
      const parentMain =
        mainById.get(def.mainCategoryId) || mainByName.get(def.mainCategory.trim());
      byId.set(def.id, {
        ...def,
        mainCategoryId: parentMain ? parentMain.id : def.mainCategoryId,
        mainCategory: parentMain ? parentMain.name : def.mainCategory,
        imageUrl: def.imageUrl || '',
        isDeleted: false,
      });
    }
    return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  for (const sub of firestoreSubs) {
    if (sub.id === 'sub-naruto-aot' && sub.name === 'ناروتو وهجوم العمالقة') {
      continue;
    }
    if (
      REMOVED_SUBCATEGORY_IDS.has(sub.id) ||
      REMOVED_SUBCATEGORY_NAMES.has(sub.name) ||
      REMOVED_MAIN_CATEGORY_IDS.has(sub.mainCategoryId) ||
      REMOVED_MAIN_CATEGORY_NAMES.has(sub.mainCategory)
    ) {
      byId.delete(sub.id);
      continue;
    }
    if (sub.isDeleted) {
      byId.delete(sub.id);
      continue;
    }

    const upgradedName = LEGACY_SUBCATEGORY_NAME_UPGRADES[sub.name] || sub.name;
    const resolvedMainId =
      sub.mainCategoryId ||
      resolveMainCategoryIdByName(sub.mainCategory, mainCategories);
    const parentMain =
      mainById.get(resolvedMainId) || mainByName.get(sub.mainCategory.trim());

    byId.set(sub.id, {
      ...sub,
      name: upgradedName,
      mainCategoryId: parentMain ? parentMain.id : resolvedMainId,
      mainCategory: parentMain ? parentMain.name : sub.mainCategory,
      imageUrl: sub.imageUrl || '',
      sortOrder: Number.isFinite(sub.sortOrder) ? sub.sortOrder : 1,
      isDeleted: false,
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

// Fetch all Main Categories dynamically from Firestore merged with built-in defaults (cached)
export async function fetchMainCategoriesFromFirestore(
  forceRefresh = false
): Promise<MainCategoryMeta[]> {
  if (!forceRefresh) {
    const cached = serviceCache.get<MainCategoryMeta[]>('main_categories');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  }

  try {
    const snap = await getDocs(collection(db, MAIN_CATEGORIES_COLLECTION));
    const byId = new Map<string, MainCategoryMeta>();

    // Seed map with built-in defaults (excluding Movies & TV Shows)
    for (const def of MAIN_CATEGORIES) {
      if (
        REMOVED_MAIN_CATEGORY_IDS.has(def.id) ||
        REMOVED_MAIN_CATEGORY_NAMES.has(def.name)
      ) {
        continue;
      }
      byId.set(def.id, { ...def, isDeleted: false });
    }

    snap.docs.forEach((d) => {
      const data = d.data();
      const docId = d.id;
      const docName = typeof data.name === 'string' ? data.name.trim() : '';

      // Never include removed Movies & TV Shows category
      if (
        REMOVED_MAIN_CATEGORY_IDS.has(docId) ||
        REMOVED_MAIN_CATEGORY_NAMES.has(docName)
      ) {
        byId.delete(docId);
        return;
      }

      if (data.isDeleted === true) {
        byId.delete(docId);
        return;
      }

      const existingDef =
        byId.get(docId) ||
        Array.from(byId.values()).find((m) => m.name === docName);

      const targetId = existingDef ? existingDef.id : docId;

      const resolvedName =
        docName || (existingDef ? existingDef.name : 'فئة رئيسية');
      const resolvedDescription =
        typeof data.description === 'string' && data.description.trim()
          ? data.description.trim()
          : existingDef?.description || '';
      const resolvedTagline =
        typeof data.tagline === 'string' && data.tagline.trim()
          ? data.tagline.trim()
          : resolvedDescription || existingDef?.tagline || '';
      const resolvedImageUrl =
        typeof data.imageUrl === 'string'
          ? data.imageUrl
          : existingDef?.imageUrl || '';
      const resolvedSortOrder =
        typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder)
          ? data.sortOrder
          : existingDef?.sortOrder ?? byId.size + 1;
      const resolvedIsActive =
        typeof data.isActive === 'boolean'
          ? data.isActive
          : existingDef?.isActive ?? true;
      const resolvedIsComingSoon =
        typeof data.isComingSoon === 'boolean'
          ? data.isComingSoon
          : Boolean(
              existingDef?.isComingSoon ||
                docId === 'main-1793867682734-xevr' ||
                resolvedName === 'ولا كلمة'
            );

      const validIcons: MainCategoryIconName[] = [
        'compass',
        'football',
        'trophy',
        'moon',
        'globe',
        'sparkles',
        'gamepad',
      ];
      const rawIcon = String(data.iconName || existingDef?.iconName || 'compass');
      const resolvedIcon: MainCategoryIconName = validIcons.includes(
        rawIcon as MainCategoryIconName
      )
        ? (rawIcon as MainCategoryIconName)
        : 'compass';

      byId.set(targetId, {
        id: targetId,
        name: resolvedName,
        description: resolvedDescription,
        tagline: resolvedTagline,
        imageUrl: resolvedImageUrl,
        sortOrder: resolvedSortOrder,
        isActive: resolvedIsActive,
        isComingSoon: resolvedIsComingSoon,
        isDeleted: false,
        accentColor:
          typeof data.accentColor === 'string' && data.accentColor.trim()
            ? data.accentColor.trim()
            : existingDef?.accentColor || '#14543D',
        bgTint:
          typeof data.bgTint === 'string' && data.bgTint.trim()
            ? data.bgTint.trim()
            : existingDef?.bgTint || '#EAF2EE',
        borderTint:
          typeof data.borderTint === 'string' && data.borderTint.trim()
            ? data.borderTint.trim()
            : existingDef?.borderTint || '#C5DDD1',
        iconName: resolvedIcon,
        updatedBy: String(data.updatedBy || ''),
        updatedAt: formatTimestamp(data.updatedAt),
      });
    });

    const result = Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder);
    serviceCache.set('main_categories', result);
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, MAIN_CATEGORIES_COLLECTION);
  }
}

export interface UpsertMainCategoryPayload {
  id?: string;
  name: string;
  description: string;
  tagline?: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  isComingSoon?: boolean;
  accentColor?: string;
  bgTint?: string;
  borderTint?: string;
  iconName?: MainCategoryIconName;
}

// Create or update a Main Category in Firestore and keep subcategory references consistent if renamed
export async function saveMainCategoryToFirestore(
  payload: UpsertMainCategoryPayload,
  adminUid: string,
  previousMainCat?: MainCategoryMeta
): Promise<string> {
  const docId = sanitizeId(
    payload.id ||
      previousMainCat?.id ||
      `main-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  const cleanName = payload.name.trim().slice(0, 80);
  const cleanDesc = (payload.description || '').trim().slice(0, 300);
  const cleanTagline = (payload.tagline || cleanDesc).trim().slice(0, 200);
  const cleanImageUrl = (payload.imageUrl || '').trim().slice(0, 500000);
  const cleanSortOrder = Math.max(
    0,
    Math.min(10000, Math.round(Number(payload.sortOrder) || 1))
  );

  const docData = {
    id: docId,
    name: cleanName,
    description: cleanDesc,
    tagline: cleanTagline,
    imageUrl: cleanImageUrl,
    sortOrder: cleanSortOrder,
    isActive: Boolean(payload.isActive),
    isComingSoon:
      payload.isComingSoon !== undefined
        ? Boolean(payload.isComingSoon)
        : Boolean(previousMainCat?.isComingSoon),
    isDeleted: false,
    accentColor: (
      payload.accentColor ||
      previousMainCat?.accentColor ||
      '#14543D'
    ).slice(0, 20),
    bgTint: (payload.bgTint || previousMainCat?.bgTint || '#EAF2EE').slice(
      0,
      20
    ),
    borderTint: (
      payload.borderTint ||
      previousMainCat?.borderTint ||
      '#C5DDD1'
    ).slice(0, 20),
    iconName: (
      payload.iconName ||
      previousMainCat?.iconName ||
      'compass'
    ).slice(0, 30),
    updatedBy: adminUid.slice(0, 128),
    updatedAt: serverTimestamp(),
  };

  try {
    const docRef = doc(db, MAIN_CATEGORIES_COLLECTION, docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, docData);
    } else {
      await setDoc(docRef, docData);
    }

    // If renamed, synchronize all subcategories belonging to this main category
    if (previousMainCat && previousMainCat.name !== cleanName) {
      const allSubs = await fetchAllSubcategoriesForAdmin();
      const matchingSubs = allSubs.filter(
        (s) =>
          s.mainCategoryId === docId ||
          s.mainCategory === previousMainCat.name
      );

      if (matchingSubs.length > 0) {
        const batch = writeBatch(db);
        const subSnap = await getDocs(collection(db, SUBCATEGORIES_COLLECTION));
        const existingSubIds = new Set(subSnap.docs.map((d) => d.id));

        for (const sub of matchingSubs) {
          const subRef = doc(db, SUBCATEGORIES_COLLECTION, sub.id);
          if (existingSubIds.has(sub.id)) {
            batch.update(subRef, {
              mainCategoryId: docId,
              mainCategory: cleanName,
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.set(subRef, {
              id: sub.id,
              name: sub.name.slice(0, 80),
              mainCategoryId: docId,
              mainCategory: cleanName,
              description: (sub.description || '').slice(0, 240),
              sortOrder: Math.max(0, Math.min(10000, Math.round(sub.sortOrder))),
              isActive: sub.isActive,
              isDeleted: false,
              imageUrl: (sub.imageUrl || '').slice(0, 500000),
              authorId: adminUid.slice(0, 128),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
        await batch.commit();
      }
    }

    serviceCache.invalidate('main_categories');
    serviceCache.invalidate('active_subcategories');
    serviceCache.invalidate('admin_subcategories');

    return docId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${MAIN_CATEGORIES_COLLECTION}/${docId}`
    );
  }
}

// Save or remove image for a single Main Category in Firestore
export async function saveMainCategoryImageToFirestore(
  mainCat: MainCategoryMeta,
  imageUrl: string,
  adminUid: string
): Promise<void> {
  await saveMainCategoryToFirestore(
    {
      id: mainCat.id,
      name: mainCat.name,
      description: mainCat.description,
      tagline: mainCat.tagline,
      imageUrl,
      sortOrder: mainCat.sortOrder,
      isActive: mainCat.isActive,
      isComingSoon: mainCat.isComingSoon,
      accentColor: mainCat.accentColor,
      bgTint: mainCat.bgTint,
      borderTint: mainCat.borderTint,
      iconName: mainCat.iconName,
    },
    adminUid,
    mainCat
  );
}

export interface DeleteMainCategoryOptions {
  mode: 'reassign_subcategories' | 'delete_subcategories';
  targetMainCategory?: MainCategoryMeta;
  deleteRelatedQuestionsConfirmed?: boolean;
}

// Safely delete a Main Category with subcategory reassignment or safe deletion
export async function deleteMainCategoryFromFirestore(
  mainCat: MainCategoryMeta,
  relatedSubcategories: SubcategoryItem[],
  relatedQuestions: TriviaQuestion[],
  options: DeleteMainCategoryOptions,
  adminUid: string
): Promise<void> {
  const docId = sanitizeId(mainCat.id);

  try {
    const subSnap = await getDocs(collection(db, SUBCATEGORIES_COLLECTION));
    const existingSubIds = new Set(subSnap.docs.map((d) => d.id));
    const batch = writeBatch(db);

    if (
      options.mode === 'reassign_subcategories' &&
      options.targetMainCategory
    ) {
      const targetMain = options.targetMainCategory;
      for (const sub of relatedSubcategories) {
        const subRef = doc(db, SUBCATEGORIES_COLLECTION, sub.id);
        if (existingSubIds.has(sub.id)) {
          batch.update(subRef, {
            mainCategoryId: targetMain.id,
            mainCategory: targetMain.name,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(subRef, {
            id: sub.id,
            name: sub.name.slice(0, 80),
            mainCategoryId: targetMain.id,
            mainCategory: targetMain.name,
            description: (sub.description || '').slice(0, 240),
            sortOrder: Math.max(0, Math.min(10000, Math.round(sub.sortOrder))),
            isActive: sub.isActive,
            isDeleted: false,
            imageUrl: (sub.imageUrl || '').slice(0, 500000),
            authorId: adminUid.slice(0, 128),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } else if (options.mode === 'delete_subcategories') {
      for (const sub of relatedSubcategories) {
        const subRef = doc(db, SUBCATEGORIES_COLLECTION, sub.id);
        if (DEFAULT_SUB_IDS.has(sub.id)) {
          if (existingSubIds.has(sub.id)) {
            batch.update(subRef, {
              isActive: false,
              isDeleted: true,
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.set(subRef, {
              id: sub.id,
              name: sub.name.slice(0, 80),
              mainCategoryId: sub.mainCategoryId || docId,
              mainCategory: sub.mainCategory.slice(0, 80),
              description: (sub.description || '').slice(0, 240),
              sortOrder: Math.max(0, Math.min(10000, Math.round(sub.sortOrder))),
              isActive: false,
              isDeleted: true,
              imageUrl: '',
              authorId: adminUid.slice(0, 128),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } else if (existingSubIds.has(sub.id)) {
          batch.delete(subRef);
        }
      }

      if (options.deleteRelatedQuestionsConfirmed && relatedQuestions.length > 0) {
        for (const q of relatedQuestions) {
          batch.delete(doc(db, QUESTIONS_COLLECTION, q.id));
        }
      }
    }

    // Delete or tombstone the Main Category document itself
    const mainRef = doc(db, MAIN_CATEGORIES_COLLECTION, docId);
    const mainSnap = await getDoc(mainRef);

    if (DEFAULT_MAIN_IDS.has(docId)) {
      const tombstoneData = {
        id: docId,
        name: mainCat.name.slice(0, 80),
        description: (mainCat.description || '').slice(0, 300),
        tagline: (mainCat.tagline || '').slice(0, 200),
        imageUrl: '',
        sortOrder: Math.max(0, Math.min(10000, Math.round(mainCat.sortOrder))),
        isActive: false,
        isDeleted: true,
        accentColor: (mainCat.accentColor || '#14543D').slice(0, 20),
        bgTint: (mainCat.bgTint || '#EAF2EE').slice(0, 20),
        borderTint: (mainCat.borderTint || '#C5DDD1').slice(0, 20),
        iconName: (mainCat.iconName || 'compass').slice(0, 30),
        updatedBy: adminUid.slice(0, 128),
        updatedAt: serverTimestamp(),
      };
      if (mainSnap.exists()) {
        batch.update(mainRef, tombstoneData);
      } else {
        batch.set(mainRef, tombstoneData);
      }
    } else if (mainSnap.exists()) {
      batch.delete(mainRef);
    }

    await batch.commit();
    serviceCache.invalidate('main_categories');
    serviceCache.invalidate('active_subcategories');
    serviceCache.invalidate('admin_subcategories');
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${MAIN_CATEGORIES_COLLECTION}/${docId}`
    );
  }
}

// Safely remove legacy Movies & TV Shows category and its subcategories from Firestore if present
export async function cleanupRemovedMoviesCategoryInFirestore(): Promise<void> {
  try {
    const batch = writeBatch(db);
    let hasOperations = false;

    const mainRef = doc(db, MAIN_CATEGORIES_COLLECTION, 'main-movies-series');
    const mainSnap = await getDoc(mainRef);
    if (mainSnap.exists()) {
      batch.delete(mainRef);
      hasOperations = true;
    }

    for (const subId of Array.from(REMOVED_SUBCATEGORY_IDS)) {
      const subRef = doc(db, SUBCATEGORIES_COLLECTION, subId);
      const subSnap = await getDoc(subRef);
      if (subSnap.exists()) {
        batch.delete(subRef);
        hasOperations = true;
      }
    }

    for (const qId of REMOVED_SEED_QUESTION_IDS) {
      const qRef = doc(db, QUESTIONS_COLLECTION, qId);
      const qSnap = await getDoc(qRef);
      if (qSnap.exists()) {
        batch.delete(qRef);
        hasOperations = true;
      }
    }

    if (hasOperations) {
      await batch.commit();
    }
  } catch (err) {
    console.warn('Cleanup of removed Movies category skipped or completed:', err);
  }
}

// Upload cropped image to Firebase Storage with automatic fallback to optimized data URL
export async function uploadCategoryImageToFirebase(
  categoryType: 'main' | 'sub',
  categoryId: string,
  croppedBlob: Blob,
  fallbackDataUrl: string
): Promise<string> {
  const safeId = sanitizeId(categoryId);
  const storagePath = `category-images/${categoryType}/${safeId}/card-${Date.now()}.webp`;

  try {
    const storageRef = ref(storage, storagePath);
    const uploadPromise = (async () => {
      const snapshot = await uploadBytes(storageRef, croppedBlob, {
        contentType: croppedBlob.type || 'image/webp',
      });
      return await getDownloadURL(snapshot.ref);
    })();

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Storage upload timeout')), 4500)
    );

    const downloadUrl = await Promise.race([uploadPromise, timeoutPromise]);
    if (downloadUrl && downloadUrl.startsWith('http')) {
      return downloadUrl;
    }
    return fallbackDataUrl;
  } catch {
    return fallbackDataUrl;
  }
}

// Save or remove image for a single Subcategory in Firestore
export async function saveSubcategoryImageToFirestore(
  sub: SubcategoryItem,
  imageUrl: string,
  adminUid: string
): Promise<void> {
  const docId = sanitizeId(sub.id);
  const cleanUrl = imageUrl.trim().slice(0, 500000);

  try {
    const docRef = doc(db, SUBCATEGORIES_COLLECTION, docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      await updateDoc(docRef, {
        imageUrl: cleanUrl,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        id: docId,
        name: sub.name.trim().slice(0, 80),
        mainCategoryId: sub.mainCategoryId || resolveMainCategoryIdByName(sub.mainCategory),
        mainCategory: sub.mainCategory.trim().slice(0, 80),
        description: (sub.description || '').trim().slice(0, 240),
        sortOrder: Math.max(0, Math.min(10000, Math.round(sub.sortOrder))),
        isActive: sub.isActive,
        isDeleted: false,
        imageUrl: cleanUrl,
        authorId: adminUid.slice(0, 128),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${SUBCATEGORIES_COLLECTION}/${docId}`
    );
  }
}

// Fetch Contact Us settings from Firestore (cached)
export async function fetchContactSettingsFromFirestore(
  forceRefresh = false
): Promise<ContactSettings> {
  if (!forceRefresh) {
    const cached = serviceCache.get<ContactSettings>('contact_settings');
    if (cached) return cached;
  }

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, CONTACT_DOC_ID);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      serviceCache.set('contact_settings', DEFAULT_CONTACT_SETTINGS);
      return DEFAULT_CONTACT_SETTINGS;
    }
    const data = snap.data();
    const result: ContactSettings = {
      id: CONTACT_DOC_ID,
      heading: String(data.heading || DEFAULT_CONTACT_SETTINGS.heading),
      message: String(data.message ?? DEFAULT_CONTACT_SETTINGS.message),
      whatsappUrl: String(data.whatsappUrl || ''),
      whatsappDisplay: String(data.whatsappDisplay || ''),
      emailAddress: String(data.emailAddress || ''),
      twitterUrl: String(data.twitterUrl || ''),
      instagramUrl: String(data.instagramUrl || ''),
      tiktokUrl: String(data.tiktokUrl || ''),
      snapchatUrl: String(data.snapchatUrl || ''),
      updatedBy: String(data.updatedBy || ''),
      updatedAt: formatTimestamp(data.updatedAt),
    };
    serviceCache.set('contact_settings', result);
    return result;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.GET,
      `${SETTINGS_COLLECTION}/${CONTACT_DOC_ID}`
    );
  }
}

// Save Contact Us settings to Firestore
export async function saveContactSettingsToFirestore(
  payload: Omit<ContactSettings, 'id' | 'updatedBy' | 'updatedAt'>,
  adminUid: string
): Promise<void> {
  const docRef = doc(db, SETTINGS_COLLECTION, CONTACT_DOC_ID);
  const docData = {
    id: CONTACT_DOC_ID,
    heading: (payload.heading || DEFAULT_CONTACT_SETTINGS.heading)
      .trim()
      .slice(0, 120),
    message: (payload.message || '').trim().slice(0, 500),
    whatsappUrl: (payload.whatsappUrl || '').trim().slice(0, 300),
    whatsappDisplay: (payload.whatsappDisplay || '').trim().slice(0, 120),
    emailAddress: (payload.emailAddress || '').trim().slice(0, 200),
    twitterUrl: (payload.twitterUrl || '').trim().slice(0, 300),
    instagramUrl: (payload.instagramUrl || '').trim().slice(0, 300),
    tiktokUrl: (payload.tiktokUrl || '').trim().slice(0, 300),
    snapchatUrl: (payload.snapchatUrl || '').trim().slice(0, 300),
    updatedBy: adminUid.slice(0, 128),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, docData);
    } else {
      await setDoc(docRef, docData);
    }
    serviceCache.invalidate('contact_settings');
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${SETTINGS_COLLECTION}/${CONTACT_DOC_ID}`
    );
  }
}

export async function fetchActiveSubcategories(
  mainCategories: MainCategoryMeta[] = MAIN_CATEGORIES,
  forceRefresh = false
): Promise<SubcategoryItem[]> {
  if (!forceRefresh) {
    const cached = serviceCache.get<SubcategoryItem[]>('active_subcategories');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  }

  try {
    const snap = await getDocs(collection(db, SUBCATEGORIES_COLLECTION));
    const fromDb = snap.docs.map((d) => mapDocToSubcategory(d.id, d.data()));
    const result = mergeSubcategories(fromDb, mainCategories).filter(
      (s) => s.isActive && !s.isDeleted
    );
    serviceCache.set('active_subcategories', result);
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SUBCATEGORIES_COLLECTION);
  }
}

export async function fetchAllSubcategoriesForAdmin(
  mainCategories: MainCategoryMeta[] = MAIN_CATEGORIES,
  forceRefresh = false
): Promise<SubcategoryItem[]> {
  if (!forceRefresh) {
    const cached = serviceCache.get<SubcategoryItem[]>('admin_subcategories');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  }

  try {
    const snap = await getDocs(collection(db, SUBCATEGORIES_COLLECTION));
    const fromDb = snap.docs.map((d) => mapDocToSubcategory(d.id, d.data()));
    const result = mergeSubcategories(fromDb, mainCategories);
    serviceCache.set('admin_subcategories', result);
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SUBCATEGORIES_COLLECTION);
  }
}

export interface UpsertSubcategoryPayload {
  id?: string;
  name: string;
  mainCategoryId?: string;
  mainCategory: MainCategoryName;
  description: string;
  sortOrder: number;
  isActive: boolean;
  isComingSoon?: boolean;
  imageUrl?: string;
}

export async function saveSubcategoryToFirestore(
  payload: UpsertSubcategoryPayload,
  authorId: string,
  oldSubcategoryName?: string
): Promise<string> {
  const docId = sanitizeId(
    payload.id || `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  const cleanName = payload.name.trim().slice(0, 80);
  const cleanMainCat = payload.mainCategory.trim().slice(0, 80);
  const cleanMainCatId = sanitizeId(
    payload.mainCategoryId || resolveMainCategoryIdByName(cleanMainCat)
  );

  try {
    const docRef = doc(db, SUBCATEGORIES_COLLECTION, docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const existingData = snap.data();
      const resolvedImageUrl =
        payload.imageUrl !== undefined
          ? payload.imageUrl.trim().slice(0, 500000)
          : String(existingData.imageUrl || '');

      await updateDoc(docRef, {
        name: cleanName,
        mainCategoryId: cleanMainCatId,
        mainCategory: cleanMainCat,
        description: (payload.description || '').trim().slice(0, 240),
        sortOrder: Math.max(0, Math.min(10000, Math.round(payload.sortOrder))),
        isActive: payload.isActive,
        isComingSoon:
          payload.isComingSoon !== undefined
            ? Boolean(payload.isComingSoon)
            : existingData.isComingSoon === true,
        isDeleted: false,
        imageUrl: resolvedImageUrl,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        id: docId,
        name: cleanName,
        mainCategoryId: cleanMainCatId,
        mainCategory: cleanMainCat,
        description: (payload.description || '').trim().slice(0, 240),
        sortOrder: Math.max(0, Math.min(10000, Math.round(payload.sortOrder))),
        isActive: payload.isActive,
        isComingSoon: Boolean(payload.isComingSoon),
        isDeleted: false,
        imageUrl: (payload.imageUrl || '').trim().slice(0, 500000),
        authorId: authorId.slice(0, 128),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // If renamed, also update questions belonging to the old subcategory name
    if (
      oldSubcategoryName &&
      oldSubcategoryName.trim() &&
      oldSubcategoryName.trim() !== cleanName
    ) {
      const qSnap = await getDocs(
        query(
          collection(db, QUESTIONS_COLLECTION),
          where('category', '==', oldSubcategoryName.trim())
        )
      );
      if (!qSnap.empty) {
        const batch = writeBatch(db);
        qSnap.docs.forEach((qDoc) => {
          batch.update(doc(db, QUESTIONS_COLLECTION, qDoc.id), {
            subcategoryId: docId,
            category: cleanName,
            reviewedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    serviceCache.invalidate('active_subcategories');
    serviceCache.invalidate('admin_subcategories');

    return docId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${SUBCATEGORIES_COLLECTION}/${docId}`
    );
  }
}

export interface DeleteSubcategoryOptions {
  mode: 'keep_questions' | 'reassign_questions' | 'delete_questions';
  targetSubcategory?: SubcategoryItem;
  deleteQuestionsConfirmed?: boolean;
}

export async function deleteSubcategorySafeFromFirestore(
  sub: SubcategoryItem,
  relatedQuestions: TriviaQuestion[],
  options: DeleteSubcategoryOptions,
  adminUid: string
): Promise<void> {
  const docId = sanitizeId(sub.id);

  try {
    const batch = writeBatch(db);

    if (
      options.mode === 'reassign_questions' &&
      options.targetSubcategory &&
      relatedQuestions.length > 0
    ) {
      for (const q of relatedQuestions) {
        batch.update(doc(db, QUESTIONS_COLLECTION, q.id), {
          subcategoryId: options.targetSubcategory.id,
          category: options.targetSubcategory.name.slice(0, 80),
          reviewedAt: serverTimestamp(),
        });
      }
    } else if (
      options.mode === 'delete_questions' &&
      options.deleteQuestionsConfirmed &&
      relatedQuestions.length > 0
    ) {
      for (const q of relatedQuestions) {
        batch.delete(doc(db, QUESTIONS_COLLECTION, q.id));
      }
    }

    const subRef = doc(db, SUBCATEGORIES_COLLECTION, docId);
    const subSnap = await getDoc(subRef);

    if (DEFAULT_SUB_IDS.has(docId)) {
      const tombstone = {
        id: docId,
        name: sub.name.slice(0, 80),
        mainCategoryId:
          sub.mainCategoryId || resolveMainCategoryIdByName(sub.mainCategory),
        mainCategory: sub.mainCategory.slice(0, 80),
        description: (sub.description || '').slice(0, 240),
        sortOrder: Math.max(0, Math.min(10000, Math.round(sub.sortOrder))),
        isActive: false,
        isDeleted: true,
        imageUrl: '',
        authorId: adminUid.slice(0, 128),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (subSnap.exists()) {
        batch.update(subRef, {
          isActive: false,
          isDeleted: true,
          imageUrl: '',
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(subRef, tombstone);
      }
    } else if (subSnap.exists()) {
      batch.delete(subRef);
    }

    await batch.commit();
    serviceCache.invalidate('active_subcategories');
    serviceCache.invalidate('admin_subcategories');
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${SUBCATEGORIES_COLLECTION}/${docId}`
    );
  }
}

export async function fetchApprovedQuestions(
  forceRefresh = false
): Promise<TriviaQuestion[]> {
  if (!forceRefresh) {
    const cached = serviceCache.get<TriviaQuestion[]>('approved_questions');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  }

  try {
    const q = query(
      collection(db, QUESTIONS_COLLECTION),
      where('status', 'in', ['approved', 'pending'])
    );
    const snap = await getDocs(q);
    const result = snap.docs
      .map((d) => mapDocToQuestion(d.id, d.data()))
      .filter(
        (item) =>
          item.status !== 'rejected' &&
          !REMOVED_SUBCATEGORY_NAMES.has(item.category)
      );
    serviceCache.set('approved_questions', result);
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, QUESTIONS_COLLECTION);
  }
}

export async function fetchAllQuestionsForAdmin(
  forceRefresh = false
): Promise<TriviaQuestion[]> {
  if (!forceRefresh) {
    const cached = serviceCache.get<TriviaQuestion[]>('admin_questions');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  }

  try {
    const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
    const result = snap.docs
      .map((d) => mapDocToQuestion(d.id, d.data()))
      .filter((item) => !REMOVED_SUBCATEGORY_NAMES.has(item.category));
    serviceCache.set('admin_questions', result);
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, QUESTIONS_COLLECTION);
  }
}

// Optimized targeted query: fetch questions only for the selected subcategories used on the game board
export async function fetchQuestionsForSubcategories(
  subcategories: { id: string; name: string }[]
): Promise<TriviaQuestion[]> {
  if (!subcategories || subcategories.length === 0) return [];

  // Check if we already have the full approved questions in cache
  const cachedFull = serviceCache.get<TriviaQuestion[]>('approved_questions');
  if (cachedFull && cachedFull.length > 0) {
    const subNames = new Set(subcategories.map((s) => s.name));
    const subIds = new Set(subcategories.map((s) => s.id));
    return cachedFull.filter(
      (q) =>
        (q.subcategoryId && subIds.has(q.subcategoryId)) ||
        subNames.has(q.category)
    );
  }

  // Otherwise, query Firestore specifically for these subcategory IDs / names in batches of 10
  try {
    const results: TriviaQuestion[] = [];
    const names = Array.from(new Set(subcategories.map((s) => s.name)));
    const chunkSize = 10;
    for (let i = 0; i < names.length; i += chunkSize) {
      const chunk = names.slice(i, i + chunkSize);
      const q = query(
        collection(db, QUESTIONS_COLLECTION),
        where('category', 'in', chunk)
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const item = mapDocToQuestion(d.id, d.data());
        if (item.status !== 'rejected') {
          results.push(item);
        }
      });
    }
    return results;
  } catch (err) {
    console.warn('Targeted questions query error:', err);
    return [];
  }
}

export async function uploadQuestionImageToStorage(
  file: File,
  subcategoryIdOrCategory: string,
  questionIdHint?: string
): Promise<{ imageUrl: string; imageStoragePath: string }> {
  const validationError = validateQuestionImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const lowerName = file.name.toLowerCase();
  let ext = 'jpg';
  if (file.type === 'image/png' || lowerName.endsWith('.png')) {
    ext = 'png';
  } else if (file.type === 'image/webp' || lowerName.endsWith('.webp')) {
    ext = 'webp';
  }

  const safeFolder = sanitizeId(subcategoryIdOrCategory || 'general');
  const safeQuestionPrefix = sanitizeId(questionIdHint || 'q');
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `question-images/${safeFolder}/${safeQuestionPrefix}-${uniqueToken}.${ext}`;

  try {
    const storageRef = ref(storage, storagePath);
    const uploadPromise = (async () => {
      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      });
      return await getDownloadURL(snapshot.ref);
    })();

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'انتهت مهلة رفع الصورة إلى Firebase Storage. تأكد من تفعيل خدمة Storage في مشروع Firebase ومن اتصال الإنترنت.'
            )
          ),
        12000
      )
    );

    const downloadUrl = await Promise.race([uploadPromise, timeoutPromise]);
    if (!downloadUrl || !downloadUrl.startsWith('http')) {
      throw new Error('لم يتم استلام رابط صالح للصورة من Firebase Storage.');
    }

    return {
      imageUrl: downloadUrl,
      imageStoragePath: storagePath,
    };
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'storage/unauthorized') {
      throw new Error(
        'غير مصرح برفع الصورة إلى Firebase Storage (تأكد من تسجيل الدخول بحساب المشرف وضبط قواعد Storage).'
      );
    }
    throw new Error(
      err instanceof Error
        ? err.message
        : 'تعذر رفع الصورة إلى Firebase Storage. بيانات السؤال النصية محفوظة في النموذج ويمكنك إعادة المحاولة.'
    );
  }
}

export async function uploadQuestionAudioToStorage(
  file: File,
  subcategoryIdOrCategory: string,
  questionIdHint?: string
): Promise<{ audioUrl: string; audioStoragePath: string }> {
  const validationError = validateQuestionAudioFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const lowerName = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  let ext = 'mp3';
  let fallbackContentType = 'audio/mpeg';

  if (mime.includes('wav') || lowerName.endsWith('.wav')) {
    ext = 'wav';
    fallbackContentType = 'audio/wav';
  } else if (mime.includes('ogg') || lowerName.endsWith('.ogg')) {
    ext = 'ogg';
    fallbackContentType = 'audio/ogg';
  } else if (mime.includes('m4a') || mime === 'audio/mp4' || lowerName.endsWith('.m4a')) {
    ext = 'm4a';
    fallbackContentType = 'audio/mp4';
  } else if (mime.includes('aac') || lowerName.endsWith('.aac')) {
    ext = 'aac';
    fallbackContentType = 'audio/aac';
  } else if (mime.includes('webm') || lowerName.endsWith('.webm')) {
    ext = 'webm';
    fallbackContentType = 'audio/webm';
  }

  const safeFolder = sanitizeId(subcategoryIdOrCategory || 'general');
  const safeQuestionPrefix = sanitizeId(questionIdHint || 'q');
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `question-audio/${safeFolder}/${safeQuestionPrefix}-${uniqueToken}.${ext}`;

  try {
    const storageRef = ref(storage, storagePath);
    const uploadPromise = (async () => {
      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || fallbackContentType,
      });
      return await getDownloadURL(snapshot.ref);
    })();

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'انتهت مهلة رفع المقطع الصوتي إلى Firebase Storage. تأكد من تفعيل خدمة Storage ومن سرعة اتصال الإنترنت.'
            )
          ),
        20000
      )
    );

    const downloadUrl = await Promise.race([uploadPromise, timeoutPromise]);
    if (!downloadUrl || !downloadUrl.startsWith('http')) {
      throw new Error('لم يتم استلام رابط صالح للمقطع الصوتي من Firebase Storage.');
    }

    return {
      audioUrl: downloadUrl,
      audioStoragePath: storagePath,
    };
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'storage/unauthorized') {
      throw new Error(
        'غير مصرح برفع المقطع الصوتي إلى Firebase Storage (تأكد من تسجيل الدخول بحساب المشرف وضبط قواعد Storage).'
      );
    }
    throw new Error(
      err instanceof Error
        ? err.message
        : 'تعذر رفع المقطع الصوتي إلى Firebase Storage. بيانات السؤال النصية محفوظة في النموذج ويمكنك إعادة المحاولة.'
    );
  }
}

export async function deleteQuestionImageFromStorage(
  storagePath?: string
): Promise<void> {
  if (!storagePath || !storagePath.trim()) return;
  try {
    const storageRef = ref(storage, storagePath.trim());
    await deleteObject(storageRef);
  } catch (err: any) {
    // Ignore object-not-found or already deleted files so question operations never break
    if (err?.code !== 'storage/object-not-found') {
      console.warn('Could not delete old question image from Storage:', err);
    }
  }
}

export interface CreateQuestionPayload {
  id?: string;
  subcategoryId?: string;
  category: string; // Subcategory name
  questionText: string;
  questionType: QuestionType;
  mediaType?: QuestionMediaType;
  difficulty: DifficultyLevel;
  points: PointValue;
  options: string[];
  correctAnswer: string;
  explanation: string;
  source: string;
  status: ApprovalStatus;
  imageUrl?: string;
  imageStoragePath?: string;
  imageDescription?: string;
  audioUrl?: string;
  audioStoragePath?: string;
  audioMaxPlays?: number | null;
}

function sanitizeMediaFieldsForWrite(
  payload: Omit<CreateQuestionPayload, 'id'>
): {
  mediaType: QuestionMediaType;
  imageUrl: string;
  imageStoragePath: string;
  imageDescription: string;
  audioUrl: string;
  audioStoragePath: string;
  audioMaxPlays: number | null;
} {
  const rawImageUrl = (payload.imageUrl || '').trim();
  if (rawImageUrl.startsWith('data:')) {
    throw new Error('لا يُسمح بتخزين الصور بصيغة Base64 داخل مستندات Firestore.');
  }
  const rawAudioUrl = (payload.audioUrl || '').trim();
  if (rawAudioUrl.startsWith('data:')) {
    throw new Error('لا يُسمح بتخزين الملفات الصوتية بصيغة Base64 داخل مستندات Firestore.');
  }

  const validImageUrl =
    rawImageUrl.startsWith('http://') || rawImageUrl.startsWith('https://')
      ? rawImageUrl.slice(0, 2000)
      : '';
  const validAudioUrl =
    rawAudioUrl.startsWith('http://') || rawAudioUrl.startsWith('https://')
      ? rawAudioUrl.slice(0, 2000)
      : '';

  const resolvedMediaType = inferQuestionMediaType({
    mediaType: payload.mediaType,
    imageUrl: validImageUrl,
    audioUrl: validAudioUrl,
  });

  if (resolvedMediaType === 'audio') {
    return {
      mediaType: 'audio',
      imageUrl: '',
      imageStoragePath: '',
      imageDescription: '',
      audioUrl: validAudioUrl,
      audioStoragePath: validAudioUrl
        ? (payload.audioStoragePath || '').trim().slice(0, 500)
        : '',
      audioMaxPlays: normalizeAudioMaxPlays(payload.audioMaxPlays),
    };
  }

  if (resolvedMediaType === 'image') {
    return {
      mediaType: 'image',
      imageUrl: validImageUrl,
      imageStoragePath: validImageUrl
        ? (payload.imageStoragePath || '').trim().slice(0, 500)
        : '',
      imageDescription: validImageUrl
        ? (payload.imageDescription || '').trim().slice(0, 300)
        : '',
      audioUrl: '',
      audioStoragePath: '',
      audioMaxPlays: null,
    };
  }

  return {
    mediaType: 'text',
    imageUrl: '',
    imageStoragePath: '',
    imageDescription: '',
    audioUrl: '',
    audioStoragePath: '',
    audioMaxPlays: null,
  };
}

export async function createQuestionInFirestore(
  payload: CreateQuestionPayload,
  authorId: string
): Promise<string> {
  const docId = sanitizeId(
    payload.id || `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );
  const cleanQuestionText = payload.questionText.trim().slice(0, 600);
  const cleanCorrectAnswer = payload.correctAnswer.trim().slice(0, 300);
  const needsReview = requiresMcqOptionsToMakeSense(
    cleanQuestionText,
    cleanCorrectAnswer
  );
  const resolvedStatus: ApprovalStatus =
    payload.status === 'approved' && needsReview ? 'pending' : payload.status;

  const mediaFields = sanitizeMediaFieldsForWrite(payload);

  const docData: Record<string, any> = {
    id: docId,
    category: payload.category.trim().slice(0, 80),
    questionText: cleanQuestionText,
    questionType: 'direct',
    mediaType: mediaFields.mediaType,
    difficulty: payload.difficulty,
    points: Number(payload.points),
    options: [],
    correctAnswer: cleanCorrectAnswer,
    explanation: (payload.explanation || '').trim().slice(0, 800),
    source: (payload.source || '').trim().slice(0, 300),
    status: resolvedStatus,
    imageUrl: mediaFields.imageUrl,
    imageStoragePath: mediaFields.imageStoragePath,
    imageDescription: mediaFields.imageDescription,
    audioUrl: mediaFields.audioUrl,
    audioStoragePath: mediaFields.audioStoragePath,
    audioMaxPlays: mediaFields.audioMaxPlays,
    authorId: authorId.slice(0, 128),
    createdAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
  };

  if (payload.subcategoryId) {
    docData.subcategoryId = sanitizeId(payload.subcategoryId);
  }

  try {
    await setDoc(doc(db, QUESTIONS_COLLECTION, docId), docData);
    serviceCache.invalidate('approved_questions');
    serviceCache.invalidate('admin_questions');
    return docId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `${QUESTIONS_COLLECTION}/${docId}`
    );
  }
}

export async function updateQuestionInFirestore(
  questionId: string,
  payload: Omit<CreateQuestionPayload, 'id'>,
  authorId: string = 'system'
): Promise<void> {
  const cleanQuestionText = payload.questionText.trim().slice(0, 600);
  const cleanCorrectAnswer = payload.correctAnswer.trim().slice(0, 300);
  const needsReview = requiresMcqOptionsToMakeSense(
    cleanQuestionText,
    cleanCorrectAnswer
  );
  const resolvedStatus: ApprovalStatus =
    payload.status === 'approved' && needsReview ? 'pending' : payload.status;

  const mediaFields = sanitizeMediaFieldsForWrite(payload);

  const updateData: Record<string, any> = {
    category: payload.category.trim().slice(0, 80),
    questionText: cleanQuestionText,
    questionType: 'direct',
    mediaType: mediaFields.mediaType,
    difficulty: payload.difficulty,
    points: Number(payload.points),
    options: [],
    correctAnswer: cleanCorrectAnswer,
    explanation: (payload.explanation || '').trim().slice(0, 800),
    source: (payload.source || '').trim().slice(0, 300),
    status: resolvedStatus,
    imageUrl: mediaFields.imageUrl,
    imageStoragePath: mediaFields.imageStoragePath,
    imageDescription: mediaFields.imageDescription,
    audioUrl: mediaFields.audioUrl,
    audioStoragePath: mediaFields.audioStoragePath,
    audioMaxPlays: mediaFields.audioMaxPlays,
    reviewedAt: serverTimestamp(),
  };

  if (payload.subcategoryId) {
    updateData.subcategoryId = sanitizeId(payload.subcategoryId);
  }

  const cleanDocId = sanitizeId(questionId);
  const docRef = doc(db, QUESTIONS_COLLECTION, cleanDocId);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, updateData);
    } else {
      // Document is being persisted from the question bank for the first time
      await setDoc(docRef, {
        id: cleanDocId,
        authorId: authorId.slice(0, 128),
        createdAt: serverTimestamp(),
        ...updateData,
      });
    }
    serviceCache.invalidate('approved_questions');
    serviceCache.invalidate('admin_questions');
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${QUESTIONS_COLLECTION}/${cleanDocId}`
    );
  }
}

export async function updateQuestionStatusInFirestore(
  questionId: string,
  status: ApprovalStatus
): Promise<void> {
  const cleanDocId = sanitizeId(questionId);
  const docRef = doc(db, QUESTIONS_COLLECTION, cleanDocId);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, {
        status,
        reviewedAt: serverTimestamp(),
      });
    } else {
      // Document from expanded question bank being approved/reviewed for the first time
      const fallback = ALL_EXPANDED_QUESTIONS.find((q) => q.id === questionId);
      if (fallback) {
        await setDoc(docRef, {
          id: cleanDocId,
          subcategoryId: fallback.subcategoryId ? sanitizeId(fallback.subcategoryId) : undefined,
          category: fallback.category.trim().slice(0, 80),
          questionText: fallback.questionText.trim().slice(0, 600),
          questionType: 'direct',
          difficulty: fallback.difficulty,
          points: fallback.points,
          options: [],
          correctAnswer: fallback.correctAnswer.trim().slice(0, 300),
          explanation: (fallback.explanation || '').trim().slice(0, 800),
          source: (fallback.source || 'بنك أسئلة نِزال المعتمد').trim().slice(0, 300),
          status,
          imageUrl: fallback.imageUrl || '',
          imageDescription: fallback.imageDescription || '',
          authorId: 'system',
          createdAt: serverTimestamp(),
          reviewedAt: serverTimestamp(),
        });
      }
    }
    serviceCache.invalidate('approved_questions');
    serviceCache.invalidate('admin_questions');
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${QUESTIONS_COLLECTION}/${cleanDocId}`
    );
  }
}

export async function deleteQuestionFromFirestore(
  questionId: string,
  _imageStoragePath?: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, questionId));
    serviceCache.invalidate('approved_questions');
    serviceCache.invalidate('admin_questions');
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${QUESTIONS_COLLECTION}/${questionId}`
    );
  }
}

export async function bulkUpdateStatusInFirestore(
  questionIds: string[],
  status: ApprovalStatus
): Promise<void> {
  const batch = writeBatch(db);
  questionIds.forEach((id) => {
    batch.update(doc(db, QUESTIONS_COLLECTION, id), {
      status,
      reviewedAt: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
    serviceCache.invalidate('approved_questions');
    serviceCache.invalidate('admin_questions');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, QUESTIONS_COLLECTION);
  }
}

export async function bulkDeleteFromFirestore(
  questionIds: string[]
): Promise<void> {
  const batch = writeBatch(db);
  questionIds.forEach((id) => {
    batch.delete(doc(db, QUESTIONS_COLLECTION, id));
  });
  try {
    await batch.commit();
    serviceCache.invalidate('approved_questions');
    serviceCache.invalidate('admin_questions');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, QUESTIONS_COLLECTION);
  }
}

export async function seedInitialQuestionsToFirestore(
  authorId: string,
  existingIds: Set<string>
): Promise<number> {
  const batch = writeBatch(db);
  let addedCount = 0;

  // Ensure default main categories exist in Firestore without overwriting existing ones
  const mainSnap = await getDocs(collection(db, MAIN_CATEGORIES_COLLECTION));
  const existingMainIds = new Set(mainSnap.docs.map((d) => d.id));
  for (const mc of MAIN_CATEGORIES) {
    if (!existingMainIds.has(mc.id)) {
      batch.set(doc(db, MAIN_CATEGORIES_COLLECTION, mc.id), {
        id: mc.id,
        name: mc.name,
        description: mc.description,
        tagline: mc.tagline,
        imageUrl: mc.imageUrl || '',
        sortOrder: mc.sortOrder,
        isActive: true,
        isDeleted: false,
        accentColor: mc.accentColor,
        bgTint: mc.bgTint,
        borderTint: mc.borderTint,
        iconName: mc.iconName,
        updatedBy: authorId.slice(0, 128),
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Ensure default subcategories exist in Firestore without overwriting existing ones
  const subSnap = await getDocs(collection(db, SUBCATEGORIES_COLLECTION));
  const existingSubIds = new Set(subSnap.docs.map((d) => d.id));
  for (const sub of DEFAULT_SUBCATEGORIES) {
    if (!existingSubIds.has(sub.id)) {
      batch.set(doc(db, SUBCATEGORIES_COLLECTION, sub.id), {
        id: sub.id,
        name: sub.name,
        mainCategoryId: sub.mainCategoryId,
        mainCategory: sub.mainCategory,
        description: sub.description,
        sortOrder: sub.sortOrder,
        isActive: true,
        isDeleted: false,
        imageUrl: '',
        authorId: authorId.slice(0, 128),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Combine full expanded bank of 1,975 questions with legacy seed questions (deduplicated by ID)
  const legacyItems: TriviaQuestion[] = INITIAL_SEED_QUESTIONS.map((seed) => ({
    id: seed.id,
    category: seed.category,
    questionText: seed.questionText,
    questionType: seed.questionType,
    difficulty: seed.difficulty,
    points: seed.points,
    options: seed.options || [],
    correctAnswer: seed.correctAnswer,
    explanation: seed.explanation,
    source: seed.source,
    status: 'approved',
    authorId: 'system',
    createdAt: new Date().toISOString(),
    reviewedAt: new Date().toISOString(),
  }));

  const combinedItems: TriviaQuestion[] = [
    ...ALL_EXPANDED_QUESTIONS,
    ...legacyItems,
  ];

  const seenIds = new Set<string>();
  const uniqueItems: TriviaQuestion[] = [];
  for (const item of combinedItems) {
    const cleanId = sanitizeId(item.id);
    if (!seenIds.has(cleanId) && !existingIds.has(cleanId)) {
      seenIds.add(cleanId);
      uniqueItems.push(item);
    }
  }

  // Commit in safe chunks of 100 documents per batch to avoid limits and timeouts
  const BATCH_CHUNK_SIZE = 100;
  for (let i = 0; i < uniqueItems.length; i += BATCH_CHUNK_SIZE) {
    const chunk = uniqueItems.slice(i, i + BATCH_CHUNK_SIZE);
    const chunkBatch = writeBatch(db);

    for (const item of chunk) {
      const cleanId = sanitizeId(item.id);
      const docRef = doc(db, QUESTIONS_COLLECTION, cleanId);

      chunkBatch.set(docRef, {
        id: cleanId,
        subcategoryId: item.subcategoryId ? sanitizeId(item.subcategoryId) : undefined,
        category: item.category.trim().slice(0, 80),
        questionText: item.questionText.trim().slice(0, 600),
        questionType: 'direct',
        difficulty: item.difficulty,
        points: item.points,
        options: [],
        correctAnswer: item.correctAnswer.trim().slice(0, 300),
        explanation: (item.explanation || '').trim().slice(0, 800),
        source: (item.source || 'بنك أسئلة نِزال المعتمد').trim().slice(0, 300),
        status: item.status || 'pending',
        imageUrl: item.imageUrl || '',
        imageDescription: item.imageDescription || '',
        authorId: authorId.slice(0, 128),
        createdAt: serverTimestamp(),
        reviewedAt: serverTimestamp(),
      });
      addedCount++;
    }

    try {
      await chunkBatch.commit();
    } catch (batchErr) {
      console.error(`Batch commit failed at offset ${i}:`, batchErr);
      // Stop gracefully to keep successfully saved batches intact
      throw batchErr;
    }
  }

  return addedCount;
}

// Safely convert all existing MCQ questions in Firestore to Direct questions without deleting any data.
// If any question depends on options in its wording or lacks a clear answer, mark it as 'pending' for review.
export async function convertExistingQuestionsToDirectInFirestore(): Promise<{
  convertedCount: number;
  markedPendingCount: number;
}> {
  try {
    const snap = await getDocs(collection(db, QUESTIONS_COLLECTION));
    if (snap.empty) {
      return { convertedCount: 0, markedPendingCount: 0 };
    }

    const batch = writeBatch(db);
    let convertedCount = 0;
    let markedPendingCount = 0;
    let hasWrites = false;

    snap.docs.forEach((qDoc) => {
      const data = qDoc.data();
      const qText = String(data.questionText || '').trim();
      const cAns = String(data.correctAnswer || '').trim();
      const currentType = String(data.questionType || '');
      const currentOptions = Array.isArray(data.options) ? data.options : [];
      const currentStatus = (data.status || 'approved') as ApprovalStatus;
      const needsReview = requiresMcqOptionsToMakeSense(qText, cAns);

      const needsTypeOrOptionsUpdate =
        currentType !== 'direct' || currentOptions.length > 0;
      const needsPendingStatusUpdate =
        currentStatus === 'approved' && needsReview;

      if (needsTypeOrOptionsUpdate || needsPendingStatusUpdate) {
        const nextStatus: ApprovalStatus = needsPendingStatusUpdate
          ? 'pending'
          : currentStatus;

        batch.update(doc(db, QUESTIONS_COLLECTION, qDoc.id), {
          questionType: 'direct',
          options: [],
          status: nextStatus,
          reviewedAt: serverTimestamp(),
        });
        hasWrites = true;

        if (needsPendingStatusUpdate) {
          markedPendingCount++;
        } else {
          convertedCount++;
        }
      }
    });

    if (hasWrites) {
      await batch.commit();
    }

    return { convertedCount, markedPendingCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, QUESTIONS_COLLECTION);
  }
}

export async function recordGameSessionInFirestore(session: {
  sessionId?: string;
  teams: { id: string; name: string; color: string; score: number }[];
  selectedSubcategories: string[];
  totalQuestionsPlayed: number;
  winnerTeamName: string;
  winnerScore: number;
  userId?: string | null;
}): Promise<string> {
  const sessionId =
    session.sessionId ||
    `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    const docRef = doc(db, 'gameSessions', sessionId);
    await setDoc(docRef, {
      sessionId,
      teams: session.teams.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        score: t.score,
      })),
      selectedSubcategories: session.selectedSubcategories,
      totalQuestionsPlayed: session.totalQuestionsPlayed,
      winnerTeamName: session.winnerTeamName,
      winnerScore: session.winnerScore,
      userId: session.userId || null,
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });
    return sessionId;
  } catch (error) {
    console.warn('Could not record game session to Firestore:', error);
    return sessionId;
  }
}
