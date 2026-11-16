import {
  MainCategoryMeta,
  SubcategoryItem,
  TriviaQuestion,
} from '../types/game';

export const OFFLINE_DB_NAME = 'nizal_offline_db_v1';
export const OFFLINE_STORE_NAME = 'snapshots';
export const OFFLINE_MEDIA_CACHE_NAME = 'nizal-offline-media-v1';
export const OFFLINE_DATASET_VERSION = 1;

const ACTIVE_KEY = 'active';
const STAGING_KEY = 'staging';

export interface OfflineDatasetSnapshot {
  version: number;
  checksum: string;
  syncedAt: number;
  source: 'firebase' | 'builtin';
  mainCategories: MainCategoryMeta[];
  subcategories: SubcategoryItem[];
  questions: TriviaQuestion[];
  mediaUrlsTotal: number;
  mediaUrlsCached: number;
}

export interface OfflineDataStatus {
  ready: boolean;
  syncing: boolean;
  questionsCount: number;
  categoriesCount: number;
  subcategoriesCount: number;
  syncedAt: number | null;
  source: 'firebase' | 'builtin' | null;
  mediaUrlsCached: number;
  mediaUrlsTotal: number;
}

export interface SnapshotStorageAdapter {
  get: (key: string) => Promise<OfflineDatasetSnapshot | null>;
  set: (key: string, value: OfflineDatasetSnapshot) => Promise<void>;
}

const DISALLOWED_CACHE_HOSTS = [
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'accounts.google.com',
  'oauth2.googleapis.com',
];

export function isSafeMediaUrlForOfflineCache(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//') && !trimmed.startsWith('/api/');
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (DISALLOWED_CACHE_HOSTS.some((blocked) => host.includes(blocked))) {
      return false;
    }
    const isSameOrigin =
      typeof window !== 'undefined' && parsed.origin === window.location.origin;
    const isFirebaseStorage =
      host.includes('firebasestorage.googleapis.com') ||
      host.includes('storage.googleapis.com');
    return isSameOrigin || isFirebaseStorage;
  } catch {
    return false;
  }
}

export function collectSafeMediaUrls(params: {
  mainCategories: MainCategoryMeta[];
  subcategories: SubcategoryItem[];
  questions: TriviaQuestion[];
}): string[] {
  const seen = new Set<string>();
  const add = (url?: string) => {
    if (!url) return;
    const clean = url.trim();
    if (isSafeMediaUrlForOfflineCache(clean)) {
      seen.add(clean);
    }
  };

  for (const cat of params.mainCategories) {
    if (!cat.isDeleted) add(cat.imageUrl);
  }
  for (const sub of params.subcategories) {
    if (!sub.isDeleted) add(sub.imageUrl);
  }
  for (const q of params.questions) {
    if (q.status !== 'rejected') {
      add(q.imageUrl);
    }
  }

  return Array.from(seen);
}

function sanitizeQuestionsForOffline(
  questions: TriviaQuestion[]
): TriviaQuestion[] {
  return questions
    .filter((q) => q && q.status !== 'rejected')
    .map((q) => ({
      id: String(q.id),
      subcategoryId: q.subcategoryId ? String(q.subcategoryId) : undefined,
      category: String(q.category || '').trim(),
      questionText: String(q.questionText || '').trim(),
      questionType: q.questionType === 'mcq' ? 'mcq' : 'direct',
      mediaType: q.mediaType,
      difficulty: q.difficulty || 'متوسط',
      points: q.points,
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correctAnswer: String(q.correctAnswer || '').trim(),
      explanation: String(q.explanation || ''),
      source: String(q.source || ''),
      status: 'approved',
      imageUrl: q.imageUrl ? String(q.imageUrl) : undefined,
      imageStoragePath: q.imageStoragePath
        ? String(q.imageStoragePath)
        : undefined,
      imageDescription: q.imageDescription
        ? String(q.imageDescription)
        : undefined,
      audioUrl: q.audioUrl ? String(q.audioUrl) : undefined,
      audioStoragePath: q.audioStoragePath
        ? String(q.audioStoragePath)
        : undefined,
      audioMaxPlays:
        typeof q.audioMaxPlays === 'number' ? q.audioMaxPlays : null,
      authorId: 'offline_snapshot',
      createdAt: String(q.createdAt || ''),
      reviewedAt: String(q.reviewedAt || ''),
    }));
}

export function validateOfflineDataset(input: {
  mainCategories: unknown;
  subcategories: unknown;
  questions: unknown;
}): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(input.mainCategories) || input.mainCategories.length === 0) {
    return { ok: false, reason: 'قائمة الفئات الرئيسية فارغة أو غير صالحة.' };
  }
  if (!Array.isArray(input.subcategories) || input.subcategories.length === 0) {
    return { ok: false, reason: 'قائمة الفئات الفرعية فارغة أو غير صالحة.' };
  }
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    return { ok: false, reason: 'قائمة الأسئلة فارغة أو غير صالحة.' };
  }

  const activeMains = input.mainCategories.filter(
    (m: any) => m && m.id && m.name && !m.isDeleted
  );
  if (activeMains.length === 0) {
    return { ok: false, reason: 'لا توجد فئات رئيسية فعالة في البيانات.' };
  }

  const activeSubs = input.subcategories.filter(
    (s: any) => s && s.id && s.name && s.mainCategory && !s.isDeleted
  );
  if (activeSubs.length === 0) {
    return { ok: false, reason: 'لا توجد فئات فرعية فعالة في البيانات.' };
  }

  let validQuestions = 0;
  for (const q of input.questions as any[]) {
    if (
      q &&
      typeof q.id === 'string' &&
      q.id.trim().length > 0 &&
      typeof q.questionText === 'string' &&
      q.questionText.trim().length > 0 &&
      typeof q.correctAnswer === 'string' &&
      q.correctAnswer.trim().length > 0 &&
      typeof q.category === 'string' &&
      q.category.trim().length > 0 &&
      typeof q.points === 'number' &&
      q.points > 0
    ) {
      validQuestions++;
    }
  }

  if (validQuestions === 0) {
    return { ok: false, reason: 'لا توجد أسئلة مكتملة وصالحة للحفظ المحلي.' };
  }

  return { ok: true };
}

export function computeDatasetChecksum(params: {
  version: number;
  mainCategories: MainCategoryMeta[];
  subcategories: SubcategoryItem[];
  questions: TriviaQuestion[];
}): string {
  // Deterministic FNV-1a 32-bit digest across structural fields (fast & synchronous)
  let hash = 0x811c9dc5;
  const feed = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };

  feed(`v${params.version}|`);
  feed(`m:${params.mainCategories.length}|`);
  for (const m of params.mainCategories) {
    feed(`${m.id}:${m.name}:${m.imageUrl || ''}|`);
  }
  feed(`s:${params.subcategories.length}|`);
  for (const s of params.subcategories) {
    feed(`${s.id}:${s.name}:${s.imageUrl || ''}|`);
  }
  feed(`q:${params.questions.length}|`);
  for (const q of params.questions) {
    feed(`${q.id}:${q.points}:${q.category}|`);
  }

  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function verifySnapshotIntegrity(
  snapshot: OfflineDatasetSnapshot | null | undefined
): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (snapshot.version !== OFFLINE_DATASET_VERSION) return false;
  const valid = validateOfflineDataset(snapshot);
  if (!valid.ok) return false;
  const expectedChecksum = computeDatasetChecksum({
    version: snapshot.version,
    mainCategories: snapshot.mainCategories,
    subcategories: snapshot.subcategories,
    questions: snapshot.questions,
  });
  return snapshot.checksum === expectedChecksum;
}

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB غير مدعوم في هذه البيئة'));
      return;
    }
    const req = indexedDB.open(OFFLINE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        db.createObjectStore(OFFLINE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error || new Error('تعذر فتح قاعدة البيانات المحلية'));
  });
}

export const indexedDBSnapshotStorage: SnapshotStorageAdapter = {
  async get(key: string): Promise<OfflineDatasetSnapshot | null> {
    const db = await openOfflineDB();
    try {
      return await new Promise<OfflineDatasetSnapshot | null>(
        (resolve, reject) => {
          const tx = db.transaction(OFFLINE_STORE_NAME, 'readonly');
          const store = tx.objectStore(OFFLINE_STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () =>
            resolve((req.result as OfflineDatasetSnapshot) || null);
          req.onerror = () =>
            reject(req.error || new Error('فشل قراءة البيانات المحلية'));
        }
      );
    } finally {
      db.close();
    }
  },
  async set(key: string, value: OfflineDatasetSnapshot): Promise<void> {
    const db = await openOfflineDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(OFFLINE_STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => {};
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(tx.error || new Error('فشل حفظ البيانات المحلية'));
        tx.onabort = () =>
          reject(tx.error || new Error('تم إلغاء حفظ البيانات المحلية'));
      });
    } finally {
      db.close();
    }
  },
};

export async function precacheMediaUrls(
  urls: string[],
  concurrency = 4
): Promise<number> {
  if (
    typeof window === 'undefined' ||
    !('caches' in window) ||
    navigator.onLine === false ||
    urls.length === 0
  ) {
    return 0;
  }

  let cachedCount = 0;
  try {
    const cache = await caches.open(OFFLINE_MEDIA_CACHE_NAME);
    const queue = urls.filter(isSafeMediaUrlForOfflineCache);
    let cursor = 0;

    const worker = async () => {
      while (cursor < queue.length) {
        const idx = cursor++;
        const url = queue[idx];
        try {
          const existing = await cache.match(url);
          if (existing) {
            cachedCount++;
            continue;
          }
          const isCrossOrigin =
            url.startsWith('http') && !url.startsWith(window.location.origin);
          const response = await fetch(url, {
            method: 'GET',
            mode: isCrossOrigin ? 'cors' : 'same-origin',
            credentials: 'omit',
          });
          if (response.ok) {
            await cache.put(url, response.clone());
            cachedCount++;
          }
        } catch {
          // Cross-origin or transient image failure must never abort dataset sync
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      () => worker()
    );
    await Promise.all(workers);
  } catch {
    // Ignore Cache Storage errors in restricted environments
  }

  return cachedCount;
}

export async function loadActiveOfflineDataset(
  storage: SnapshotStorageAdapter = indexedDBSnapshotStorage
): Promise<OfflineDatasetSnapshot | null> {
  try {
    const active = await storage.get(ACTIVE_KEY);
    if (!verifySnapshotIntegrity(active)) {
      return null;
    }
    return active;
  } catch {
    return null;
  }
}

export async function getOfflineDataStatus(
  storage: SnapshotStorageAdapter = indexedDBSnapshotStorage
): Promise<OfflineDataStatus> {
  const active = await loadActiveOfflineDataset(storage);
  if (!active) {
    return {
      ready: false,
      syncing: false,
      questionsCount: 0,
      categoriesCount: 0,
      subcategoriesCount: 0,
      syncedAt: null,
      source: null,
      mediaUrlsCached: 0,
      mediaUrlsTotal: 0,
    };
  }

  return {
    ready: true,
    syncing: false,
    questionsCount: active.questions.length,
    categoriesCount: active.mainCategories.filter((m) => !m.isDeleted).length,
    subcategoriesCount: active.subcategories.filter((s) => !s.isDeleted).length,
    syncedAt: active.syncedAt,
    source: active.source,
    mediaUrlsCached: active.mediaUrlsCached,
    mediaUrlsTotal: active.mediaUrlsTotal,
  };
}

/**
 * Atomic Staging Swap:
 * 1) Validates dataset completely.
 * 2) Writes candidate to 'staging' first and verifies readback checksum.
 * 3) Only then promotes candidate to 'active'.
 * If any step fails, the previous 'active' snapshot remains untouched.
 */
export async function syncOfflineDatasetAtomically(
  input: {
    mainCategories: MainCategoryMeta[];
    subcategories: SubcategoryItem[];
    questions: TriviaQuestion[];
    source: 'firebase' | 'builtin';
  },
  options?: {
    storage?: SnapshotStorageAdapter;
    precacheMedia?: boolean;
  }
): Promise<
  | { ok: true; snapshot: OfflineDatasetSnapshot }
  | { ok: false; reason: string }
> {
  const storage = options?.storage || indexedDBSnapshotStorage;
  const cleanQuestions = sanitizeQuestionsForOffline(input.questions || []);
  const cleanMains = (input.mainCategories || []).filter((m) => m && !m.isDeleted);
  const cleanSubs = (input.subcategories || []).filter((s) => s && !s.isDeleted);

  const validation = validateOfflineDataset({
    mainCategories: cleanMains,
    subcategories: cleanSubs,
    questions: cleanQuestions,
  });

  if (!validation.ok) {
    return validation;
  }

  const mediaUrls = collectSafeMediaUrls({
    mainCategories: cleanMains,
    subcategories: cleanSubs,
    questions: cleanQuestions,
  });

  const candidate: OfflineDatasetSnapshot = {
    version: OFFLINE_DATASET_VERSION,
    checksum: computeDatasetChecksum({
      version: OFFLINE_DATASET_VERSION,
      mainCategories: cleanMains,
      subcategories: cleanSubs,
      questions: cleanQuestions,
    }),
    syncedAt: Date.now(),
    source: input.source,
    mainCategories: cleanMains,
    subcategories: cleanSubs,
    questions: cleanQuestions,
    mediaUrlsTotal: mediaUrls.length,
    mediaUrlsCached: 0,
  };

  try {
    // Stage & verify integrity before promoting to active
    await storage.set(STAGING_KEY, candidate);
    const stagedReadback = await storage.get(STAGING_KEY);
    if (!verifySnapshotIntegrity(stagedReadback)) {
      return {
        ok: false,
        reason: 'فشل التحقق من سلامة النسخة المحدثة؛ تم الإبقاء على النسخة السابقة.',
      };
    }

    // Best-effort media pre-caching in background/parallel without blocking text atomic swap
    if (options?.precacheMedia !== false && mediaUrls.length > 0) {
      const cached = await precacheMediaUrls(mediaUrls);
      candidate.mediaUrlsCached = cached;
      candidate.checksum = computeDatasetChecksum({
        version: candidate.version,
        mainCategories: candidate.mainCategories,
        subcategories: candidate.subcategories,
        questions: candidate.questions,
      });
    }

    // Promote verified snapshot atomically to active
    await storage.set(ACTIVE_KEY, candidate);
    return { ok: true, snapshot: candidate };
  } catch (err) {
    console.warn('Offline dataset atomic sync failed; keeping previous snapshot:', err);
    return {
      ok: false,
      reason: 'تعذر تحديث البيانات المحلية؛ تم الإبقاء على النسخة المحفوظة السابقة.',
    };
  }
}
