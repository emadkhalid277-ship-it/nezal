import { loadFirebaseConfig } from './cloudinarySignCore.ts';

export const SERVER_QUOTA_COOLDOWN_MS = 45_000;
export const SERVER_QUOTA_EXCEEDED_MESSAGE =
  'تم تجاوز حصة قاعدة البيانات (Firestore Quota Exceeded) مؤقتاً. تم إيقاف الطلبات المتكررة لحماية الحصة، يرجى الانتظار قليلاً والمحاولة مجدداً.';

export class FirestoreHttpError extends Error {
  status: number;
  code: string;
  retryAfterMs?: number;

  constructor(status: number, code: string, message: string, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

interface CollectionCounters {
  reads: number;
  writes: number;
  quota429: number;
}

const serverFirestoreStats = {
  reads: 0,
  writes: 0,
  conflicts409: 0,
  quota429: 0,
  cooldownSkips: 0,
  byCollection: new Map<string, CollectionCounters>(),
};

let serverQuotaCooldownUntil = 0;

function recordCollectionOp(collectionPath: string, op: 'reads' | 'writes' | 'quota429'): void {
  serverFirestoreStats[op] += 1;
  const cleanCol = collectionPath.replace(/^\/+|\/+$/g, '') || 'unknown';
  let entry = serverFirestoreStats.byCollection.get(cleanCol);
  if (!entry) {
    entry = { reads: 0, writes: 0, quota429: 0 };
    serverFirestoreStats.byCollection.set(cleanCol, entry);
  }
  entry[op] += 1;
}

function isQuotaErrorDetails(status: number, code: string, message: string): boolean {
  const lowerCode = code.toLowerCase();
  const lowerMsg = message.toLowerCase();
  return (
    status === 429 ||
    lowerCode.includes('resource_exhausted') ||
    lowerCode.includes('resource-exhausted') ||
    lowerCode.includes('quota-exceeded') ||
    lowerMsg.includes('quota exceeded') ||
    lowerMsg.includes('resource_exhausted')
  );
}

function throwIfServerQuotaCoolingDown(collectionPath: string, opLabel: string): void {
  const now = Date.now();
  if (serverQuotaCooldownUntil > now) {
    serverFirestoreStats.cooldownSkips += 1;
    const remainingMs = serverQuotaCooldownUntil - now;
    throw new FirestoreHttpError(
      429,
      'firestore/quota-exceeded',
      SERVER_QUOTA_EXCEEDED_MESSAGE,
      remainingMs
    );
  }
  if (serverQuotaCooldownUntil > 0 && now >= serverQuotaCooldownUntil) {
    serverQuotaCooldownUntil = 0;
  }
  void collectionPath;
  void opLabel;
}

function throwMappedFirestoreError(
  status: number,
  code: string,
  message: string,
  collectionPath: string
): never {
  if (isQuotaErrorDetails(status, code, message)) {
    serverQuotaCooldownUntil = Date.now() + SERVER_QUOTA_COOLDOWN_MS;
    recordCollectionOp(collectionPath, 'quota429');
    console.warn('[NIZAL Server Firestore 429]', {
      collectionPath,
      status,
      code,
      message,
      cooldownMs: SERVER_QUOTA_COOLDOWN_MS,
      totals: {
        reads: serverFirestoreStats.reads,
        writes: serverFirestoreStats.writes,
        conflicts409: serverFirestoreStats.conflicts409,
        quota429: serverFirestoreStats.quota429,
        cooldownSkips: serverFirestoreStats.cooldownSkips,
      },
    });
    throw new FirestoreHttpError(
      429,
      'firestore/quota-exceeded',
      SERVER_QUOTA_EXCEEDED_MESSAGE,
      SERVER_QUOTA_COOLDOWN_MS
    );
  }
  throw new FirestoreHttpError(status, code, message);
}

export function getServerFirestoreDiagnostics() {
  const byCollection: Record<string, CollectionCounters> = {};
  serverFirestoreStats.byCollection.forEach((v, k) => {
    byCollection[k] = { ...v };
  });
  const now = Date.now();
  return {
    reads: serverFirestoreStats.reads,
    writes: serverFirestoreStats.writes,
    conflicts409: serverFirestoreStats.conflicts409,
    quota429: serverFirestoreStats.quota429,
    cooldownSkips: serverFirestoreStats.cooldownSkips,
    cooldownActive: serverQuotaCooldownUntil > now,
    cooldownRemainingMs: Math.max(0, serverQuotaCooldownUntil - now),
    byCollection,
  };
}

export function resetServerFirestoreDiagnosticsForTest(): void {
  serverFirestoreStats.reads = 0;
  serverFirestoreStats.writes = 0;
  serverFirestoreStats.conflicts409 = 0;
  serverFirestoreStats.quota429 = 0;
  serverFirestoreStats.cooldownSkips = 0;
  serverFirestoreStats.byCollection.clear();
  serverQuotaCooldownUntil = 0;
}

export interface FirestoreRawValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FirestoreRawValue[] };
  mapValue?: { fields?: Record<string, FirestoreRawValue> };
}

export interface FirestoreDocResponse<T> {
  exists: boolean;
  data: T | null;
  updateTime?: string;
}

function getDatabaseId(): string {
  const cfg = loadFirebaseConfig();
  return cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)'
    ? cfg.firestoreDatabaseId
    : '(default)';
}

function buildDocumentUrl(collectionPath: string, docId: string): string {
  const cfg = loadFirebaseConfig();
  const dbId = getDatabaseId();
  const cleanCollection = collectionPath.replace(/^\/+|\/+$/g, '');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/${cleanCollection}/${encodeURIComponent(docId)}`;
}

export function firestoreValueToJs(value: FirestoreRawValue | undefined): unknown {
  if (!value || typeof value !== 'object') return undefined;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) {
    const n = Number(value.integerValue);
    return Number.isSafeInteger(n) ? n : Number(value.integerValue);
  }
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return String(value.timestampValue || '');
  if ('stringValue' in value) return String(value.stringValue ?? '');
  if ('arrayValue' in value) {
    const vals = value.arrayValue?.values || [];
    return vals.map((item) => firestoreValueToJs(item));
  }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      const converted = firestoreValueToJs(v);
      if (converted !== undefined) {
        out[k] = converted;
      }
    }
    return out;
  }
  return undefined;
}

export function jsToFirestoreValue(val: unknown): FirestoreRawValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      return { nullValue: null };
    }
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => jsToFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreRawValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v === undefined) continue;
      fields[k] = jsToFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function docFieldsToObject<T>(fields: Record<string, FirestoreRawValue> | undefined): T {
  const out: Record<string, unknown> = {};
  if (!fields) return out as T;
  for (const [k, v] of Object.entries(fields)) {
    const converted = firestoreValueToJs(v);
    if (converted !== undefined) {
      out[k] = converted;
    }
  }
  return out as T;
}

function objectToDocFields(obj: Record<string, unknown>): Record<string, FirestoreRawValue> {
  const fields: Record<string, FirestoreRawValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = jsToFirestoreValue(v);
  }
  return fields;
}

async function parseFirestoreError(res: Response): Promise<{ code: string; message: string }> {
  try {
    const payload = (await res.json()) as {
      error?: { status?: string; message?: string };
    };
    return {
      code: payload?.error?.status || `HTTP_${res.status}`,
      message: payload?.error?.message || `Firestore request failed (HTTP ${res.status})`,
    };
  } catch {
    return {
      code: `HTTP_${res.status}`,
      message: `Firestore request failed (HTTP ${res.status})`,
    };
  }
}

export async function firestoreGetDoc<T>(
  collectionPath: string,
  docId: string,
  idToken?: string
): Promise<FirestoreDocResponse<T>> {
  throwIfServerQuotaCoolingDown(collectionPath, 'get');
  const url = buildDocumentUrl(collectionPath, docId);
  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  recordCollectionOp(collectionPath, 'reads');
  const res = await fetch(url, { method: 'GET', headers });
  if (res.status === 404) {
    return { exists: false, data: null };
  }
  if (!res.ok) {
    const err = await parseFirestoreError(res);
    throwMappedFirestoreError(res.status, err.code, err.message, collectionPath);
  }

  const docJson = (await res.json()) as {
    fields?: Record<string, FirestoreRawValue>;
    updateTime?: string;
  };
  return {
    exists: true,
    data: docFieldsToObject<T>(docJson.fields),
    updateTime: docJson.updateTime,
  };
}

export async function firestoreBatchGetDocs<T>(
  targets: { collectionPath: string; docId: string }[],
  idToken?: string
): Promise<Map<string, FirestoreDocResponse<T>>> {
  const results = new Map<string, FirestoreDocResponse<T>>();
  if (targets.length === 0) return results;

  const cfg = loadFirebaseConfig();
  const dbId = getDatabaseId();
  const baseDocPrefix = `projects/${cfg.projectId}/databases/${dbId}/documents/`;
  const uniquePaths: string[] = [];
  const pathToKey = new Map<string, string>();
  const pathToCollection = new Map<string, string>();

  for (const t of targets) {
    const cleanCol = t.collectionPath.replace(/^\/+|\/+$/g, '');
    const key = `${cleanCol}/${t.docId}`;
    const fullPath = `${baseDocPrefix}${cleanCol}/${t.docId}`;
    if (!pathToKey.has(fullPath)) {
      uniquePaths.push(fullPath);
      pathToKey.set(fullPath, key);
      pathToCollection.set(fullPath, cleanCol);
    }
  }

  throwIfServerQuotaCoolingDown('batchGet', 'batchGet');

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents:batchGet`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  // Record 1 read per requested unique document path
  for (const fullPath of uniquePaths) {
    recordCollectionOp(pathToCollection.get(fullPath) || 'unknown', 'reads');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ documents: uniquePaths }),
  });

  if (!res.ok) {
    const err = await parseFirestoreError(res);
    throwMappedFirestoreError(res.status, err.code, err.message, 'batchGet');
  }

  const items = (await res.json()) as Array<{
    found?: {
      name?: string;
      fields?: Record<string, FirestoreRawValue>;
      updateTime?: string;
    };
    missing?: string;
  }>;

  if (Array.isArray(items)) {
    for (const item of items) {
      if (item.found?.name) {
        const key = pathToKey.get(item.found.name) || item.found.name.slice(baseDocPrefix.length);
        results.set(key, {
          exists: true,
          data: docFieldsToObject<T>(item.found.fields),
          updateTime: item.found.updateTime,
        });
      } else if (item.missing) {
        const key = pathToKey.get(item.missing) || item.missing.slice(baseDocPrefix.length);
        results.set(key, { exists: false, data: null });
      }
    }
  }

  return results;
}

export async function firestoreCreateDoc<T extends Record<string, unknown>>(
  collectionPath: string,
  docId: string,
  data: T,
  idToken: string
): Promise<{ data: T; updateTime?: string }> {
  throwIfServerQuotaCoolingDown(collectionPath, 'create');
  const baseUrl = buildDocumentUrl(collectionPath, docId);
  const url = `${baseUrl}?currentDocument.exists=false`;

  recordCollectionOp(collectionPath, 'writes');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: objectToDocFields(data),
    }),
  });

  if (!res.ok) {
    const err = await parseFirestoreError(res);
    throwMappedFirestoreError(res.status, err.code, err.message, collectionPath);
  }

  const docJson = (await res.json()) as {
    fields?: Record<string, FirestoreRawValue>;
    updateTime?: string;
  };
  return {
    data: docFieldsToObject<T>(docJson.fields),
    updateTime: docJson.updateTime,
  };
}

export async function firestorePatchDocWithUpdateTime<T extends Record<string, unknown>>(
  collectionPath: string,
  docId: string,
  data: T,
  updateTime: string,
  idToken: string
): Promise<{ data: T; updateTime?: string }> {
  throwIfServerQuotaCoolingDown(collectionPath, 'patch');
  const baseUrl = buildDocumentUrl(collectionPath, docId);
  const url = `${baseUrl}?currentDocument.updateTime=${encodeURIComponent(updateTime)}`;

  recordCollectionOp(collectionPath, 'writes');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: objectToDocFields(data),
    }),
  });

  if (!res.ok) {
    const err = await parseFirestoreError(res);
    throwMappedFirestoreError(res.status, err.code, err.message, collectionPath);
  }

  const docJson = (await res.json()) as {
    fields?: Record<string, FirestoreRawValue>;
    updateTime?: string;
  };
  return {
    data: docFieldsToObject<T>(docJson.fields),
    updateTime: docJson.updateTime,
  };
}

export async function runRoomCasTransaction<T extends Record<string, unknown>>(params: {
  roomCode: string;
  idToken: string;
  maxAttempts?: number;
  mutator: (current: T) => Promise<T | null> | T | null;
}): Promise<{ data: T; changed: boolean }> {
  const cleanCode = params.roomCode.trim().toUpperCase();
  const docId = `room_${cleanCode}`;
  const attempts = Math.max(1, params.maxAttempts ?? 5);

  for (let i = 0; i < attempts; i++) {
    const fetched = await firestoreGetDoc<T>('gameSessions', docId, params.idToken);
    if (!fetched.exists || !fetched.data || !fetched.updateTime) {
      throw new FirestoreHttpError(
        404,
        'room/not-found',
        'الغرفة غير موجودة أو تم إغلاقها.'
      );
    }

    const updated = await params.mutator(fetched.data);
    if (updated === null) {
      return { data: fetched.data, changed: false };
    }

    try {
      const committed = await firestorePatchDocWithUpdateTime<T>(
        'gameSessions',
        docId,
        updated,
        fetched.updateTime,
        params.idToken
      );
      return { data: committed.data, changed: true };
    } catch (err) {
      if (
        err instanceof FirestoreHttpError &&
        (err.status === 429 || err.code === 'firestore/quota-exceeded')
      ) {
        // NEVER retry 429 / RESOURCE_EXHAUSTED
        throw err;
      }
      if (
        err instanceof FirestoreHttpError &&
        (err.status === 409 || err.status === 412 || err.code === 'ABORTED' || err.code === 'FAILED_PRECONDITION') &&
        i < attempts - 1
      ) {
        serverFirestoreStats.conflicts409 += 1;
        await new Promise((r) => setTimeout(r, 35 * (i + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new FirestoreHttpError(
    409,
    'room/conflict',
    'تعارض في التحديث المتزامن للغرفة، يرجى المحاولة مجدداً.'
  );
}
