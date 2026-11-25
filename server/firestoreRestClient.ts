import { loadFirebaseConfig } from './cloudinarySignCore.ts';

export class FirestoreHttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
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
  const url = buildDocumentUrl(collectionPath, docId);
  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const res = await fetch(url, { method: 'GET', headers });
  if (res.status === 404) {
    return { exists: false, data: null };
  }
  if (!res.ok) {
    const err = await parseFirestoreError(res);
    throw new FirestoreHttpError(res.status, err.code, err.message);
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

export async function firestoreCreateDoc<T extends Record<string, unknown>>(
  collectionPath: string,
  docId: string,
  data: T,
  idToken: string
): Promise<{ data: T; updateTime?: string }> {
  const baseUrl = buildDocumentUrl(collectionPath, docId);
  const url = `${baseUrl}?currentDocument.exists=false`;

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
    throw new FirestoreHttpError(res.status, err.code, err.message);
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
  const baseUrl = buildDocumentUrl(collectionPath, docId);
  const url = `${baseUrl}?currentDocument.updateTime=${encodeURIComponent(updateTime)}`;

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
    throw new FirestoreHttpError(res.status, err.code, err.message);
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
        (err.status === 409 || err.status === 412 || err.code === 'ABORTED' || err.code === 'FAILED_PRECONDITION') &&
        i < attempts - 1
      ) {
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
