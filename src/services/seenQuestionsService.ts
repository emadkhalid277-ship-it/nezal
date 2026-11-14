import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  QuestionDedupSettings,
  SeenQuestionRecord,
} from '../types/game';
import {
  buildSeenRecordId,
  DEFAULT_QUESTION_DEDUP_SETTINGS,
  normalizeSeenQuestionId,
} from '../utils/questionDedupLogic';

const USER_SEEN_QUESTIONS_COLLECTION = 'userSeenQuestions';
const SETTINGS_COLLECTION = 'settings';
const QUESTION_DEDUP_DOC_ID = 'question_dedup';
const PENDING_SEEN_QUEUE_KEY = 'nizal_pending_seen_queue_v1';
const SETTINGS_CACHE_TTL_MS = 2 * 60 * 1000;

interface PendingSeenQueueItem {
  id: string;
  userId: string;
  questionId: string;
  subcategoryId: string;
  category: string;
  seenAtMs: number;
  mode: 'local' | 'online';
}

let cachedDedupSettings: {
  data: QuestionDedupSettings;
  expiresAt: number;
} | null = null;

// Session-level deduplication so React re-renders or double-effects do not write the same display twice
const recordedDisplayTokens = new Set<string>();

// In-memory seen cache per UID for instant synchronous updates before Firestore snapshot echoes back
const localUserSeenMap = new Map<string, Set<string>>();

function formatTimestamp(val: unknown): string {
  if (!val) return '';
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return new Date(val).toISOString();
  return '';
}

function readPendingQueue(): PendingSeenQueueItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(PENDING_SEEN_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingQueue(items: PendingSeenQueueItem[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (items.length === 0) {
      localStorage.removeItem(PENDING_SEEN_QUEUE_KEY);
    } else {
      localStorage.setItem(PENDING_SEEN_QUEUE_KEY, JSON.stringify(items));
    }
  } catch {
    // ignore storage quota errors
  }
}

function enqueuePendingSeenItem(item: PendingSeenQueueItem): void {
  const existing = readPendingQueue();
  const idx = existing.findIndex((entry) => entry.id === item.id);
  if (idx >= 0) {
    existing[idx] = {
      ...existing[idx],
      seenAtMs: Math.max(existing[idx].seenAtMs, item.seenAtMs),
      mode: item.mode,
    };
  } else {
    existing.push(item);
  }
  writePendingQueue(existing);
}

function removePendingSeenItem(recordId: string): void {
  const existing = readPendingQueue();
  const next = existing.filter((entry) => entry.id !== recordId);
  if (next.length !== existing.length) {
    writePendingQueue(next);
  }
}

export function getPendingSeenIdsForUser(uid: string): string[] {
  if (!uid) return [];
  const queue = readPendingQueue();
  const ids: string[] = [];
  for (const item of queue) {
    if (item.userId === uid) {
      ids.push(item.questionId);
      ids.push(normalizeSeenQuestionId(item.questionId));
    }
  }
  return ids;
}

export function clearPendingSeenQueueForUser(uid: string): void {
  if (!uid) return;
  const existing = readPendingQueue();
  const next = existing.filter((item) => item.userId !== uid);
  writePendingQueue(next);
  localUserSeenMap.delete(uid);
}

function mapDocToSeenRecord(id: string, data: Record<string, any>): SeenQuestionRecord {
  return {
    id,
    userId: String(data.userId || ''),
    questionId: String(data.questionId || ''),
    subcategoryId: String(data.subcategoryId || ''),
    category: String(data.category || ''),
    firstSeenAtMs:
      typeof data.firstSeenAtMs === 'number' ? data.firstSeenAtMs : Date.now(),
    lastSeenAtMs:
      typeof data.lastSeenAtMs === 'number' ? data.lastSeenAtMs : Date.now(),
    seenCount: typeof data.seenCount === 'number' ? data.seenCount : 1,
    mode: data.mode === 'online' ? 'online' : 'local',
  };
}

async function persistSeenItemTransaction(
  item: PendingSeenQueueItem
): Promise<void> {
  const cleanQuestionId = normalizeSeenQuestionId(item.questionId);
  const recordId = buildSeenRecordId(item.userId, cleanQuestionId);
  const docRef = doc(db, USER_SEEN_QUESTIONS_COLLECTION, recordId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists()) {
      tx.set(docRef, {
        id: recordId,
        userId: item.userId.slice(0, 128),
        questionId: cleanQuestionId,
        subcategoryId: String(item.subcategoryId || '').slice(0, 128),
        category: String(item.category || 'عام').trim().slice(0, 80) || 'عام',
        firstSeenAtMs: item.seenAtMs,
        lastSeenAtMs: item.seenAtMs,
        seenCount: 1,
        mode: item.mode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = snap.data() || {};
      const prevCount =
        typeof existingData.seenCount === 'number' && existingData.seenCount >= 1
          ? existingData.seenCount
          : 1;
      const prevLast =
        typeof existingData.lastSeenAtMs === 'number'
          ? existingData.lastSeenAtMs
          : item.seenAtMs;

      tx.update(docRef, {
        lastSeenAtMs: Math.max(prevLast, item.seenAtMs),
        seenCount: prevCount + 1,
        mode: item.mode,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Record a question as actually displayed to a specific signed-in user (UID-bound).
 * Safe against concurrent writes, network drops (offline retry buffer), and duplicate triggers.
 */
export async function recordQuestionSeenForUser(params: {
  uid: string;
  questionId: string;
  category: string;
  subcategoryId?: string;
  mode: 'local' | 'online';
  displayKey?: string;
}): Promise<boolean> {
  const { uid, questionId, category, subcategoryId = '', mode, displayKey } = params;
  if (!uid || !questionId) return false;

  const cleanUid = uid.trim().slice(0, 128);
  const cleanQId = normalizeSeenQuestionId(questionId);
  const recordId = buildSeenRecordId(cleanUid, cleanQId);

  // Deduplicate identical display event inside the same page session
  const sessionToken = displayKey
    ? `${recordId}::${displayKey}`
    : `${recordId}::${Date.now()}`;
  if (displayKey && recordedDisplayTokens.has(sessionToken)) {
    return false;
  }
  if (displayKey) {
    recordedDisplayTokens.add(sessionToken);
  }

  // Update immediate in-memory cache so parallel clicks never re-serve this question
  if (!localUserSeenMap.has(cleanUid)) {
    localUserSeenMap.set(cleanUid, new Set());
  }
  const userSet = localUserSeenMap.get(cleanUid)!;
  userSet.add(questionId);
  userSet.add(cleanQId);

  const item: PendingSeenQueueItem = {
    id: recordId,
    userId: cleanUid,
    questionId: cleanQId,
    subcategoryId: String(subcategoryId || '').slice(0, 128),
    category: String(category || 'عام').trim().slice(0, 80) || 'عام',
    seenAtMs: Date.now(),
    mode,
  };

  // Enqueue optimistically first, then remove on confirmed Firestore commit
  enqueuePendingSeenItem(item);

  try {
    await persistSeenItemTransaction(item);
    removePendingSeenItem(recordId);
    return true;
  } catch (err) {
    console.warn(
      'Seen question write queued for retry when connection stabilizes:',
      err
    );
    return false;
  }
}

/**
 * Flush any locally buffered seen-question writes to Firestore (e.g. after reconnecting).
 */
export async function flushPendingSeenQuestions(uid: string): Promise<number> {
  if (!uid) return 0;
  const queue = readPendingQueue().filter((item) => item.userId === uid);
  if (queue.length === 0) return 0;

  let flushed = 0;
  for (const item of queue) {
    try {
      await persistSeenItemTransaction(item);
      removePendingSeenItem(item.id);
      flushed++;
    } catch {
      // keep remaining items in queue for next retry
    }
  }
  return flushed;
}

/**
 * Subscribe in real time to a signed-in user's seen questions across all matches & devices.
 */
export function subscribeToUserSeenQuestions(
  uid: string,
  onUpdate: (seenIds: Set<string>, records: SeenQuestionRecord[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (!uid) {
    onUpdate(new Set(), []);
    return () => {};
  }

  const q = query(
    collection(db, USER_SEEN_QUESTIONS_COLLECTION),
    where('userId', '==', uid)
  );

  // Immediately emit any locally buffered items while waiting for snapshot
  const initialSet = new Set<string>(getPendingSeenIdsForUser(uid));
  const memSet = localUserSeenMap.get(uid);
  if (memSet) {
    memSet.forEach((id) => initialSet.add(id));
  }
  if (initialSet.size > 0) {
    onUpdate(initialSet, []);
  }

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const records: SeenQuestionRecord[] = [];
      const mergedIds = new Set<string>(getPendingSeenIdsForUser(uid));

      snapshot.forEach((d) => {
        const rec = mapDocToSeenRecord(d.id, d.data());
        records.push(rec);
        mergedIds.add(rec.questionId);
        mergedIds.add(normalizeSeenQuestionId(rec.questionId));
      });

      localUserSeenMap.set(uid, mergedIds);
      onUpdate(mergedIds, records);
    },
    (error) => {
      console.warn('Could not subscribe to user seen questions:', error);
      if (onError) onError(error);
    }
  );

  return unsub;
}

/**
 * Fetch global Question Deduplication settings (/settings/question_dedup).
 */
export async function fetchQuestionDedupSettingsFromFirestore(
  forceRefresh = false
): Promise<QuestionDedupSettings> {
  if (
    !forceRefresh &&
    cachedDedupSettings &&
    cachedDedupSettings.expiresAt > Date.now()
  ) {
    return cachedDedupSettings.data;
  }

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, QUESTION_DEDUP_DOC_ID);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      cachedDedupSettings = {
        data: DEFAULT_QUESTION_DEDUP_SETTINGS,
        expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
      };
      return DEFAULT_QUESTION_DEDUP_SETTINGS;
    }

    const data = snap.data() || {};
    const result: QuestionDedupSettings = {
      id: QUESTION_DEDUP_DOC_ID,
      allowRepeatAfterExhaustion: Boolean(data.allowRepeatAfterExhaustion),
      trackSpectators: Boolean(data.trackSpectators),
      updatedBy: String(data.updatedBy || ''),
      updatedAt: formatTimestamp(data.updatedAt),
    };

    cachedDedupSettings = {
      data: result,
      expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
    };
    return result;
  } catch (error) {
    console.warn('Question dedup settings read fallback to defaults:', error);
    return DEFAULT_QUESTION_DEDUP_SETTINGS;
  }
}

/**
 * Save Question Deduplication settings to Firestore (Admin only).
 */
export async function saveQuestionDedupSettingsToFirestore(
  payload: Omit<QuestionDedupSettings, 'id' | 'updatedBy' | 'updatedAt'>,
  adminUid: string
): Promise<QuestionDedupSettings> {
  const docRef = doc(db, SETTINGS_COLLECTION, QUESTION_DEDUP_DOC_ID);
  const cleanPayload = {
    id: QUESTION_DEDUP_DOC_ID,
    allowRepeatAfterExhaustion: Boolean(payload.allowRepeatAfterExhaustion),
    trackSpectators: Boolean(payload.trackSpectators),
    updatedBy: adminUid.slice(0, 128),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, cleanPayload);
    } else {
      await setDoc(docRef, cleanPayload);
    }

    const saved: QuestionDedupSettings = {
      id: QUESTION_DEDUP_DOC_ID,
      allowRepeatAfterExhaustion: cleanPayload.allowRepeatAfterExhaustion,
      trackSpectators: cleanPayload.trackSpectators,
      updatedBy: cleanPayload.updatedBy,
    };
    cachedDedupSettings = {
      data: saved,
      expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
    };
    return saved;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${SETTINGS_COLLECTION}/${QUESTION_DEDUP_DOC_ID}`
    );
  }
}

/**
 * Admin-only: Fetch all user seen question records to compute per-user counts,
 * remaining unseen questions per category, and most frequently displayed questions.
 */
export async function fetchAllSeenQuestionsForAdmin(): Promise<SeenQuestionRecord[]> {
  try {
    const snap = await getDocs(collection(db, USER_SEEN_QUESTIONS_COLLECTION));
    return snap.docs.map((d) => mapDocToSeenRecord(d.id, d.data()));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.LIST,
      USER_SEEN_QUESTIONS_COLLECTION
    );
  }
}

/**
 * Admin-only: Reset/clear a specific player's seen question history.
 * Strictly requires admin privileges in Firestore security rules.
 */
export async function resetUserSeenQuestionsByAdmin(
  targetUid: string
): Promise<number> {
  if (!targetUid) return 0;
  try {
    const q = query(
      collection(db, USER_SEEN_QUESTIONS_COLLECTION),
      where('userId', '==', targetUid)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      clearPendingSeenQueueForUser(targetUid);
      return 0;
    }

    const docs = snap.docs;
    const CHUNK_SIZE = 450;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      chunk.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    }

    clearPendingSeenQueueForUser(targetUid);
    // Clear recorded session tokens for this target UID so new displays track cleanly
    for (const token of Array.from(recordedDisplayTokens)) {
      if (token.startsWith(`${targetUid}__`)) {
        recordedDisplayTokens.delete(token);
      }
    }

    return docs.length;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      USER_SEEN_QUESTIONS_COLLECTION
    );
  }
}
