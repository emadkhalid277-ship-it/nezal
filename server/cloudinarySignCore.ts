import crypto from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
export const BOOTSTRAPPED_ADMIN_EMAIL = 'emadkhalid277@gmail.com';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const MAX_JSON_BODY_BYTES = 64 * 1024;

export interface FirebaseClientConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

export interface ApiRequestLike extends IncomingMessage {
  body?: unknown;
  query?: Record<string, unknown>;
}

export type ApiResponseLike = ServerResponse;

let cachedFirebaseConfig: FirebaseClientConfig | null = null;

export function loadFirebaseConfig(): FirebaseClientConfig {
  if (cachedFirebaseConfig) {
    return cachedFirebaseConfig;
  }

  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(import.meta.dirname, '..', 'firebase-applet-config.json'),
    path.resolve(import.meta.dirname, '..', '..', 'firebase-applet-config.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, 'utf8');
      cachedFirebaseConfig = JSON.parse(raw) as FirebaseClientConfig;
      return cachedFirebaseConfig;
    }
  }

  const envProjectId = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  if (envProjectId) {
    cachedFirebaseConfig = {
      projectId: envProjectId,
      apiKey: (process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '').trim(),
      firestoreDatabaseId: (process.env.FIRESTORE_DATABASE_ID || '').trim(),
    };
    return cachedFirebaseConfig;
  }

  throw new Error('Missing firebase-applet-config.json on server');
}

// Cache Google SecureToken public certificates according to Cache-Control max-age
let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public certificates (HTTP ${res.status})`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = {
    certs,
    expiresAt: now + Math.max(60, maxAgeSeconds - 60) * 1000,
  };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

function verifyTokenWithCert(
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
  payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  },
  certPem: string
): VerifiedFirebaseUser {
  const firebaseConfig = loadFirebaseConfig();
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const normalizedSig = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
  const sigBuffer = Buffer.from(
    normalizedSig + '='.repeat((4 - (normalizedSig.length % 4)) % 4),
    'base64'
  );

  if (!verifier.verify(certPem, sigBuffer)) {
    throw new Error('Invalid Firebase token signature');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIss = `https://securetoken.google.com/${firebaseConfig.projectId}`;
  if (payload.aud !== firebaseConfig.projectId || payload.iss !== expectedIss) {
    throw new Error('Firebase token audience or issuer mismatch');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Firebase token missing valid subject');
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Firebase token expired');
  }
  if (payload.iat && payload.iat > nowSec + 300) {
    throw new Error('Firebase token issued in the future');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    emailVerified: payload.email_verified === true,
  };
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  }>(payloadB64);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase token header');
  }

  const certs = await getGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    // Refresh certs once in case of key rotation
    cachedCerts = null;
    const freshCerts = await getGooglePublicCerts();
    if (!freshCerts[header.kid]) {
      throw new Error('Unknown Firebase token signing key');
    }
    return verifyTokenWithCert(headerB64, payloadB64, signatureB64, payload, freshCerts[header.kid]);
  }

  return verifyTokenWithCert(headerB64, payloadB64, signatureB64, payload, certPem);
}

export async function checkIsAdminUser(
  user: VerifiedFirebaseUser,
  idToken: string
): Promise<boolean> {
  if (user.email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  if (!user.emailVerified) {
    return false;
  }
  const firebaseConfig = loadFirebaseConfig();
  const dbId =
    firebaseConfig.firestoreDatabaseId &&
    firebaseConfig.firestoreDatabaseId !== '(default)'
      ? firebaseConfig.firestoreDatabaseId
      : '(default)';
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(user.uid)}`;
  try {
    const res = await fetch(docUrl, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Per-UID sliding window rate limiter to prevent abuse (max 25 uploads/min)
const signRateLimitMap = new Map<string, number[]>();

function isRateLimited(uid: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const recent = (signRateLimitMap.get(uid) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= 25) {
    signRateLimitMap.set(uid, recent);
    return true;
  }
  recent.push(now);
  signRateLimitMap.set(uid, recent);
  return false;
}

function sanitizeSegment(raw: unknown, fallback: string, maxLen = 64): string {
  const str = typeof raw === 'string' ? raw.trim() : '';
  const cleaned = str.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (cleaned || fallback).slice(0, maxLen);
}

export function getCloudinaryCredentials(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  return {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  };
}

function sendJson(res: ApiResponseLike, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: ApiRequestLike): Promise<Record<string, unknown>> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (!req.body.trim()) return {};
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    }
    if (Buffer.isBuffer(req.body)) {
      const text = req.body.toString('utf8').trim();
      if (!text) return {};
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    }
    if (typeof req.body === 'object') {
      return req.body as Record<string, unknown>;
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_JSON_BODY_BYTES) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
}

function getQueryParam(req: ApiRequestLike, key: string): string {
  if (req.query && key in req.query) {
    const val = req.query[key];
    return Array.isArray(val) ? String(val[0] || '') : String(val || '');
  }
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    return parsed.searchParams.get(key) || '';
  } catch {
    return '';
  }
}

export async function handleCloudinaryHealthRequest(
  req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void> {
  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, {
      code: 'method/not-allowed',
      error: 'طريقة الطلب غير مدعومة لهذا المسار. استخدم GET.',
    });
    return;
  }

  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  const configured = Boolean(cloudName && apiKey && apiSecret);
  const payload: Record<string, unknown> = {
    configured,
    hasCloudName: Boolean(cloudName),
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret),
  };

  if (getQueryParam(req, 'verify') === '1' && configured) {
    try {
      const authHeader = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const pingRes = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/ping`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${authHeader}`,
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      const pingBody = (await pingRes.json().catch(() => ({}))) as {
        status?: string;
        error?: { message?: string };
      };
      payload.connectionVerified = pingRes.ok && pingBody.status === 'ok';
      payload.cloudinaryStatus = pingRes.status;
      if (!pingRes.ok) {
        payload.connectionError =
          pingBody?.error?.message || `Cloudinary ping HTTP ${pingRes.status}`;
      }
    } catch (err) {
      payload.connectionVerified = false;
      payload.connectionError =
        err instanceof Error ? err.message : 'Cloudinary ping failed';
    }
  }

  sendJson(res, 200, payload);
}

export async function handleCloudinarySignRequest(
  req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void> {
  if ((req.method || '').toUpperCase() !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, {
      code: 'method/not-allowed',
      error: 'طريقة الطلب غير مدعومة لمسار توقيع الرفع. يجب استخدام POST.',
    });
    return;
  }

  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  if (!cloudName || !apiKey || !apiSecret) {
    sendJson(res, 503, {
      code: 'cloudinary/not-configured',
      error:
        'إعدادات Cloudinary غير مكتملة على الخادم. يرجى إضافة CLOUDINARY_CLOUD_NAME وCLOUDINARY_API_KEY وCLOUDINARY_API_SECRET في متغيرات البيئة الآمنة.',
    });
    return;
  }

  const rawAuth = req.headers.authorization;
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] || '' : rawAuth || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch?.[1]) {
    sendJson(res, 401, {
      code: 'auth/missing-token',
      error: 'غير مصرح بطلب توقيع الرفع. يرجى تسجيل الدخول أولًا.',
    });
    return;
  }

  const idToken = tokenMatch[1].trim();
  let verifiedUser: VerifiedFirebaseUser;
  try {
    verifiedUser = await verifyFirebaseIdToken(idToken);
  } catch (authErr) {
    console.error('[NIZAL Cloudinary Sign Auth Error]', authErr);
    sendJson(res, 401, {
      code: 'auth/invalid-token',
      error:
        'انتهت صلاحية جلسة تسجيل الدخول أو أن رمز المصادقة غير صالح. يرجى إعادة تسجيل الدخول.',
    });
    return;
  }

  if (isRateLimited(verifiedUser.uid)) {
    sendJson(res, 429, {
      code: 'cloudinary/rate-limited',
      error: 'تم تجاوز الحد المؤقت لطلبات رفع الصور. يرجى الانتظار دقيقة ثم إعادة المحاولة.',
    });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (parseErr) {
    const isTooLarge =
      parseErr instanceof Error && parseErr.message === 'PAYLOAD_TOO_LARGE';
    sendJson(res, isTooLarge ? 413 : 400, {
      code: isTooLarge ? 'cloudinary/payload-too-large' : 'cloudinary/invalid-json',
      error: isTooLarge
        ? 'بيانات طلب التوقيع تتجاوز الحد المسموح به.'
        : 'صيغة بيانات طلب التوقيع غير صالحة.',
    });
    return;
  }

  const scope =
    body.scope === 'admin_question'
      ? 'admin_question'
      : body.scope === 'admin_category'
      ? 'admin_category'
      : body.scope === 'user_question'
      ? 'user_question'
      : null;
  if (!scope) {
    sendJson(res, 400, {
      code: 'cloudinary/invalid-scope',
      error: 'نطاق رفع الصورة غير صالح.',
    });
    return;
  }

  if (scope === 'admin_question' || scope === 'admin_category') {
    const isAdmin = await checkIsAdminUser(verifiedUser, idToken);
    if (!isAdmin) {
      sendJson(res, 403, {
        code: 'auth/forbidden',
        error: 'هذا الإجراء متاح لحساب المشرف المعتمد فقط.',
      });
      return;
    }
  }

  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
  const fileSize = Number(body.fileSize);
  if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
    sendJson(res, 400, {
      code: 'cloudinary/invalid-format',
      error: 'صيغة الصورة غير مدعومة. الصيغ المسموحة هي JPG وPNG وWEBP فقط.',
    });
    return;
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_BYTES) {
    sendJson(res, 400, {
      code: 'cloudinary/invalid-size',
      error: 'حجم الصورة يجب أن يكون أكبر من صفر ولا يتجاوز 5 ميجابايت.',
    });
    return;
  }

  const folder =
    scope === 'admin_question'
      ? `nizal/questions/${sanitizeSegment(body.folderHint, 'general')}`
      : scope === 'admin_category'
      ? `nizal/categories/${sanitizeSegment(body.folderHint, 'subcategories')}`
      : `nizal/user-questions/${sanitizeSegment(verifiedUser.uid, 'user', 128)}`;

  const prefix =
    scope === 'admin_question'
      ? sanitizeSegment(body.questionIdHint, 'q')
      : scope === 'admin_category'
      ? sanitizeSegment(body.questionIdHint, 'cat')
      : 'uq';
  const publicId = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const allowedFormats = 'jpg,jpeg,png,webp';

  // Parameters must be sorted alphabetically for Cloudinary SHA-1 signature
  const paramsToSign: Record<string, string | number> = {
    allowed_formats: allowedFormats,
    folder,
    public_id: publicId,
    timestamp,
  };

  const stringToSign = Object.keys(paramsToSign)
    .sort()
    .map((key) => `${key}=${paramsToSign[key]}`)
    .join('&');

  const signature = crypto
    .createHash('sha1')
    .update(`${stringToSign}${apiSecret}`)
    .digest('hex');

  sendJson(res, 200, {
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder,
    publicId,
    allowedFormats,
  });
}
