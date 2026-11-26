export type FirestoreDiagnosticSource =
  | 'online_room'
  | 'online_room_stream'
  | 'online_room_fetch'
  | 'online_presence'
  | 'online_api'
  | 'match_sync'
  | 'presence'
  | 'questions_bootstrap'
  | 'seen_questions'
  | 'social'
  | 'auth_profile';

export type FirestoreDiagnosticOpType =
  | 'read'
  | 'write'
  | 'listener_attach'
  | 'listener_snapshot'
  | 'api_call'
  | 'quota_429'
  | 'cache_hit'
  | 'dedup_skip';

export interface FirestoreDiagnosticsCounters {
  read: number;
  write: number;
  listener_attach: number;
  listener_snapshot: number;
  api_call: number;
  quota_429: number;
  cache_hit: number;
  dedup_skip: number;
}

export interface FirestoreDiagnosticsSnapshot {
  totals: FirestoreDiagnosticsCounters;
  bySource: Record<string, FirestoreDiagnosticsCounters>;
  recentEvents: Array<{
    timestamp: number;
    source: string;
    opType: FirestoreDiagnosticOpType;
    count: number;
    detail?: string;
  }>;
  quotaState: FirestoreQuotaState;
}

export interface FirestoreQuotaState {
  paused: boolean;
  cooldownUntil: number;
  lastSource: string | null;
  lastErrorMessage: string | null;
  hitCount: number;
}

export const FIRESTORE_QUOTA_EXCEEDED_MESSAGE =
  'تم تجاوز حصة قاعدة البيانات (Firestore Quota Exceeded) مؤقتاً. تم إيقاف المزامنة والطلبات المتكررة تلقائياً لحماية الحصة. يرجى الانتظار قليلاً ثم المحاولة مجدداً.';

const DEFAULT_QUOTA_COOLDOWN_MS = 120_000;
const MAX_RECENT_EVENTS = 60;

function createEmptyCounters(): FirestoreDiagnosticsCounters {
  return {
    read: 0,
    write: 0,
    listener_attach: 0,
    listener_snapshot: 0,
    api_call: 0,
    quota_429: 0,
    cache_hit: 0,
    dedup_skip: 0,
  };
}

const totals: FirestoreDiagnosticsCounters = createEmptyCounters();
const bySource = new Map<string, FirestoreDiagnosticsCounters>();
const recentEvents: FirestoreDiagnosticsSnapshot['recentEvents'] = [];

let quotaState: FirestoreQuotaState = {
  paused: false,
  cooldownUntil: 0,
  lastSource: null,
  lastErrorMessage: null,
  hitCount: 0,
};

const quotaListeners = new Set<(state: FirestoreQuotaState) => void>();
let lastSummaryLogAt = 0;

function notifyQuotaListeners(): void {
  const snapshot = getFirestoreQuotaState();
  quotaListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // ignore listener errors
    }
  });
}

function maybeRefreshExpiredCooldown(): void {
  if (quotaState.paused && quotaState.cooldownUntil > 0 && Date.now() >= quotaState.cooldownUntil) {
    quotaState = {
      ...quotaState,
      paused: false,
      cooldownUntil: 0,
    };
    notifyQuotaListeners();
  }
}

export function isFirestoreQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'string') {
    const lower = err.toLowerCase();
    return (
      lower.includes('resource-exhausted') ||
      lower.includes('resource_exhausted') ||
      lower.includes('quota exceeded') ||
      lower.includes('firestore/quota-exceeded') ||
      lower.includes('http 429')
    );
  }
  if (typeof err === 'object') {
    const anyErr = err as {
      status?: unknown;
      code?: unknown;
      message?: unknown;
      name?: unknown;
    };
    if (anyErr.status === 429) return true;
    const code = String(anyErr.code || '').toLowerCase();
    const message = String(anyErr.message || '').toLowerCase();
    return (
      code.includes('resource-exhausted') ||
      code.includes('resource_exhausted') ||
      code.includes('quota-exceeded') ||
      message.includes('quota exceeded') ||
      message.includes('resource-exhausted') ||
      message.includes('resource_exhausted') ||
      message.includes('http 429')
    );
  }
  return false;
}

export function trackFirestoreOp(
  source: FirestoreDiagnosticSource | string,
  opType: FirestoreDiagnosticOpType,
  count = 1,
  detail?: string
): void {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) return;

  totals[opType] += safeCount;
  let sourceCounters = bySource.get(source);
  if (!sourceCounters) {
    sourceCounters = createEmptyCounters();
    bySource.set(source, sourceCounters);
  }
  sourceCounters[opType] += safeCount;

  recentEvents.push({
    timestamp: Date.now(),
    source,
    opType,
    count: safeCount,
    ...(detail ? { detail } : {}),
  });
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS);
  }

  const now = Date.now();
  if (opType === 'quota_429' || now - lastSummaryLogAt >= 30_000) {
    lastSummaryLogAt = now;
    const logPayload = {
      source,
      opType,
      count: safeCount,
      detail,
      totals: { ...totals },
    };
    if (opType === 'quota_429') {
      console.warn('[NIZAL Firestore Diagnostics][429]', logPayload);
    } else {
      console.info('[NIZAL Firestore Diagnostics]', logPayload);
    }
  }
}

export function triggerFirestoreQuotaCooldown(
  source: FirestoreDiagnosticSource | string,
  err?: unknown,
  retryAfterMs?: number
): FirestoreQuotaState {
  const durationMs =
    typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 5_000
      ? Math.min(retryAfterMs, 10 * 60_000)
      : DEFAULT_QUOTA_COOLDOWN_MS;
  const now = Date.now();
  const nextCooldownUntil = Math.max(quotaState.cooldownUntil, now + durationMs);
  const msg =
    err instanceof Error && err.message
      ? err.message
      : FIRESTORE_QUOTA_EXCEEDED_MESSAGE;

  trackFirestoreOp(source, 'quota_429', 1, msg.slice(0, 160));

  quotaState = {
    paused: true,
    cooldownUntil: nextCooldownUntil,
    lastSource: source,
    lastErrorMessage: FIRESTORE_QUOTA_EXCEEDED_MESSAGE,
    hitCount: quotaState.hitCount + 1,
  };
  notifyQuotaListeners();
  return getFirestoreQuotaState();
}

export function isFirestoreQuotaPaused(): boolean {
  maybeRefreshExpiredCooldown();
  return quotaState.paused;
}

export function getFirestoreQuotaState(): FirestoreQuotaState {
  maybeRefreshExpiredCooldown();
  return { ...quotaState };
}

export function resetFirestoreQuotaCooldown(): FirestoreQuotaState {
  quotaState = {
    ...quotaState,
    paused: false,
    cooldownUntil: 0,
  };
  notifyQuotaListeners();
  return getFirestoreQuotaState();
}

export function subscribeFirestoreQuotaState(
  listener: (state: FirestoreQuotaState) => void
): () => void {
  quotaListeners.add(listener);
  listener(getFirestoreQuotaState());
  return () => {
    quotaListeners.delete(listener);
  };
}

export function getFirestoreDiagnosticsSnapshot(): FirestoreDiagnosticsSnapshot {
  const sourceObj: Record<string, FirestoreDiagnosticsCounters> = {};
  bySource.forEach((val, key) => {
    sourceObj[key] = { ...val };
  });
  return {
    totals: { ...totals },
    bySource: sourceObj,
    recentEvents: [...recentEvents],
    quotaState: getFirestoreQuotaState(),
  };
}

export function resetFirestoreDiagnosticsForTest(): void {
  (Object.keys(totals) as Array<keyof FirestoreDiagnosticsCounters>).forEach((k) => {
    totals[k] = 0;
  });
  bySource.clear();
  recentEvents.length = 0;
  lastSummaryLogAt = 0;
  quotaState = {
    paused: false,
    cooldownUntil: 0,
    lastSource: null,
    lastErrorMessage: null,
    hitCount: 0,
  };
  notifyQuotaListeners();
}

if (typeof window !== 'undefined') {
  (window as Window & { __NIZAL_FIRESTORE_DIAGNOSTICS__?: typeof getFirestoreDiagnosticsSnapshot }).__NIZAL_FIRESTORE_DIAGNOSTICS__ =
    getFirestoreDiagnosticsSnapshot;
}
