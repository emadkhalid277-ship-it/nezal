import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  attachHostStream,
  attachPlayerStream,
  claimWalaKalimaQrSession,
  createAdminWalaKalimaWord,
  createWalaKalimaSession,
  deleteAdminWalaKalimaWord,
  getAdminWalaKalimaWords,
  getHostSessionStatus,
  getPublicWalaKalimaConfig,
  performHostSessionAction,
  performPlayerSessionAction,
  updateAdminWalaKalimaSettings,
  updateAdminWalaKalimaWord,
  validatePlayerStreamAccess,
} from './server/walaKalimaEngine.ts';
import type { WalaKalimaContentTypeId } from './src/types/walaKalima.ts';
import type { DifficultyLevel } from './src/types/game.ts';

const ROOT_DIR = path.resolve(import.meta.dirname);
const PORT = Number(process.env.PORT || 3000);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const BOOTSTRAPPED_ADMIN_EMAIL = 'emadkhalid277@gmail.com';
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface FirebaseClientConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseClientConfig {
  const configPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as FirebaseClientConfig;
}

const firebaseConfig = loadFirebaseConfig();

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

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
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

async function checkIsAdminUser(
  user: VerifiedFirebaseUser,
  idToken: string
): Promise<boolean> {
  if (user.email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  if (!user.emailVerified) {
    return false;
  }
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

function getCloudinaryCredentials(): {
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

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Health/status check (never returns secret values)
  app.get('/api/cloudinary/health', async (req: Request, res: Response) => {
    const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
    const configured = Boolean(cloudName && apiKey && apiSecret);
    const payload: Record<string, unknown> = {
      configured,
      hasCloudName: Boolean(cloudName),
      hasApiKey: Boolean(apiKey),
      hasApiSecret: Boolean(apiSecret),
    };

    if (req.query.verify === '1' && configured) {
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

    res.json(payload);
  });

  // Signed upload signature generator (API Secret never leaves the server)
  app.post('/api/cloudinary/sign', async (req: Request, res: Response) => {
    const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
    if (!cloudName || !apiKey || !apiSecret) {
      res.status(503).json({
        code: 'cloudinary/not-configured',
        error:
          'إعدادات Cloudinary غير مكتملة على الخادم. يرجى إضافة CLOUDINARY_CLOUD_NAME وCLOUDINARY_API_KEY وCLOUDINARY_API_SECRET في متغيرات البيئة الآمنة.',
      });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch?.[1]) {
      res.status(401).json({
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
      res.status(401).json({
        code: 'auth/invalid-token',
        error: 'انتهت صلاحية جلسة تسجيل الدخول أو أن رمز المصادقة غير صالح. يرجى إعادة تسجيل الدخول.',
      });
      return;
    }

    if (isRateLimited(verifiedUser.uid)) {
      res.status(429).json({
        code: 'cloudinary/rate-limited',
        error: 'تم تجاوز الحد المؤقت لطلبات رفع الصور. يرجى الانتظار دقيقة ثم إعادة المحاولة.',
      });
      return;
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const scope =
      body.scope === 'admin_question'
        ? 'admin_question'
        : body.scope === 'admin_category'
        ? 'admin_category'
        : body.scope === 'user_question'
        ? 'user_question'
        : null;
    if (!scope) {
      res.status(400).json({
        code: 'cloudinary/invalid-scope',
        error: 'نطاق رفع الصورة غير صالح.',
      });
      return;
    }

    if (scope === 'admin_question' || scope === 'admin_category') {
      const isAdmin = await checkIsAdminUser(verifiedUser, idToken);
      if (!isAdmin) {
        res.status(403).json({
          code: 'auth/forbidden',
          error: 'هذا الإجراء متاح لحساب المشرف المعتمد فقط.',
        });
        return;
      }
    }

    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
    const fileSize = Number(body.fileSize);
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      res.status(400).json({
        code: 'cloudinary/invalid-format',
        error: 'صيغة الصورة غير مدعومة. الصيغ المسموحة هي JPG وPNG وWEBP فقط.',
      });
      return;
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_BYTES) {
      res.status(400).json({
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

    res.json({
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder,
      publicId,
      allowedFormats,
    });
  });

  // =========================================================================
  // WALA KALIMA INTERACTIVE QR GAME API (Secret words never leave server
  // to unauthorized clients or the match screen)
  // =========================================================================
  async function requireAdminAuth(
    req: Request,
    res: Response
  ): Promise<VerifiedFirebaseUser | null> {
    const authHeader = req.headers.authorization || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch?.[1]) {
      res.status(401).json({
        code: 'auth/missing-token',
        error: 'غير مصرح. يرجى تسجيل الدخول بحساب المشرف أولاً.',
      });
      return null;
    }

    const idToken = tokenMatch[1].trim();
    let verifiedUser: VerifiedFirebaseUser;
    try {
      verifiedUser = await verifyFirebaseIdToken(idToken);
    } catch {
      res.status(401).json({
        code: 'auth/invalid-token',
        error: 'انتهت صلاحية جلسة المشرف أو أن الرمز غير صالح.',
      });
      return null;
    }

    const isAdmin = await checkIsAdminUser(verifiedUser, idToken);
    if (!isAdmin) {
      res.status(403).json({
        code: 'auth/forbidden',
        error: 'هذه الصلاحية متاحة لحساب المشرف المعتمد فقط.',
      });
      return null;
    }
    return verifiedUser;
  }

  // Public safe settings (no words ever returned)
  app.get('/api/wala-kalima/config', (_req: Request, res: Response) => {
    res.json(getPublicWalaKalimaConfig());
  });

  // Authoritative server clock endpoint for client clock-offset synchronization
  app.get('/api/wala-kalima/server-time', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ serverNow: Date.now() });
  });

  // Admin: fetch word bank & settings
  app.get('/api/wala-kalima/admin/words', async (req: Request, res: Response) => {
    const admin = await requireAdminAuth(req, res);
    if (!admin) return;
    res.json({
      settings: getPublicWalaKalimaConfig(),
      words: getAdminWalaKalimaWords(),
    });
  });

  // Admin: add new word
  app.post('/api/wala-kalima/admin/words', async (req: Request, res: Response) => {
    const admin = await requireAdminAuth(req, res);
    if (!admin) return;
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const entry = createAdminWalaKalimaWord({
        word: String(body.word || ''),
        forbiddenWords: Array.isArray(body.forbiddenWords)
          ? body.forbiddenWords.map(String)
          : [],
        contentType: body.contentType as WalaKalimaContentTypeId,
        difficulty: body.difficulty as DifficultyLevel,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      });
      res.status(201).json(entry);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر إضافة الكلمة.';
      res.status(400).json({ code: 'wk/invalid-word', error: message });
    }
  });

  // Admin: update existing word
  app.put('/api/wala-kalima/admin/words/:id', async (req: Request, res: Response) => {
    const admin = await requireAdminAuth(req, res);
    if (!admin) return;
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const updated = updateAdminWalaKalimaWord(String(req.params.id || ''), {
        word: body.word !== undefined ? String(body.word) : undefined,
        forbiddenWords: Array.isArray(body.forbiddenWords)
          ? body.forbiddenWords.map(String)
          : undefined,
        contentType: body.contentType as WalaKalimaContentTypeId | undefined,
        difficulty: body.difficulty as DifficultyLevel | undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      });
      res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر تحديث الكلمة.';
      res.status(400).json({ code: 'wk/update-failed', error: message });
    }
  });

  // Admin: delete word
  app.delete('/api/wala-kalima/admin/words/:id', async (req: Request, res: Response) => {
    const admin = await requireAdminAuth(req, res);
    if (!admin) return;
    const deleted = deleteAdminWalaKalimaWord(String(req.params.id || ''));
    if (!deleted) {
      res.status(404).json({ code: 'wk/not-found', error: 'الكلمة غير موجودة.' });
      return;
    }
    res.json({ ok: true });
  });

  // Admin: update settings (duration, words count, points, enabled content types)
  app.put('/api/wala-kalima/admin/settings', async (req: Request, res: Response) => {
    const admin = await requireAdminAuth(req, res);
    if (!admin) return;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const updated = updateAdminWalaKalimaSettings({
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
      timerSeconds: body.timerSeconds !== undefined ? Number(body.timerSeconds) : undefined,
      maxSkips: body.maxSkips !== undefined ? Number(body.maxSkips) : undefined,
      wordsPerRound: body.wordsPerRound !== undefined ? Number(body.wordsPerRound) : undefined,
      pointsPerCorrectWord:
        body.pointsPerCorrectWord !== undefined ? Number(body.pointsPerCorrectWord) : undefined,
      enabledContentTypes: Array.isArray(body.enabledContentTypes)
        ? (body.enabledContentTypes.map(String) as WalaKalimaContentTypeId[])
        : undefined,
    });
    res.json(updated);
  });

  // Match Screen: create QR session (never returns secret words)
  app.post('/api/wala-kalima/sessions', (req: Request, res: Response) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const session = createWalaKalimaSession({
        matchId: String(body.matchId || ''),
        tileKey: String(body.tileKey || ''),
        teamId: String(body.teamId || ''),
        teamName: String(body.teamName || ''),
        playerName: String(body.playerName || ''),
        contentType: String(body.contentType || 'football_players') as WalaKalimaContentTypeId,
        points: body.points !== undefined && body.points !== null ? Number(body.points) : undefined,
        preferredDifficulty:
          typeof body.preferredDifficulty === 'string'
            ? (body.preferredDifficulty as DifficultyLevel)
            : undefined,
      });
      res.status(201).json(session);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر إنشاء جلسة ولا كلمة.';
      res.status(400).json({ code: 'wk/create-session-failed', error: message });
    }
  });

  // Match Screen: get public round status (requires hostSecret, never returns secret words)
  app.get('/api/wala-kalima/sessions/:id/host-status', (req: Request, res: Response) => {
    try {
      const hostSecret = String(
        req.headers['x-wk-host-secret'] || req.query.hostSecret || ''
      ).trim();
      const status = getHostSessionStatus(String(req.params.id || ''), hostSecret);
      res.json(status);
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 400;
      const message = err instanceof Error ? err.message : 'تعذّر قراءة حالة الجولة.';
      res.status(statusCode).json({ code: 'wk/host-status-failed', error: message });
    }
  });

  // Match Screen: SSE real-time stream (requires hostSecret, never returns secret words)
  app.get('/api/wala-kalima/sessions/:id/stream', (req: Request, res: Response) => {
    const hostSecret = String(
      req.query.hostSecret || req.headers['x-wk-host-secret'] || ''
    ).trim();
    try {
      // Validate host access before writing SSE headers
      getHostSessionStatus(String(req.params.id || ''), hostSecret);

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const detach = attachHostStream(String(req.params.id || ''), hostSecret, res);
      req.on('close', () => {
        detach();
      });
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 403;
      const message = err instanceof Error ? err.message : 'تعذّر فتح البث المباشر.';
      res.status(statusCode).json({ code: 'wk/stream-failed', error: message });
    }
  });

  // Mobile Player: SSE real-time stream (requires playerToken, synced timer + status + current word)
  app.get('/api/wala-kalima/sessions/:id/player-stream', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const playerToken = String(
      bearerMatch?.[1] || req.query.playerToken || ''
    ).trim();
    const sessionId = String(req.params.id || '');
    try {
      validatePlayerStreamAccess(sessionId, playerToken);

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const detach = attachPlayerStream(sessionId, playerToken, res);
      req.on('close', () => {
        detach();
      });
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 403;
      const message = err instanceof Error ? err.message : 'تعذّر فتح البث المباشر للاعب.';
      res.status(statusCode).json({ code: 'wk/player-stream-failed', error: message });
    }
  });

  // Match Screen: host finish or cancel round
  app.post('/api/wala-kalima/sessions/:id/host-action', (req: Request, res: Response) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const hostSecret = String(
        req.headers['x-wk-host-secret'] || body.hostSecret || ''
      ).trim();
      const action =
        body.action === 'cancel'
          ? 'cancel'
          : body.action === 'correct'
          ? 'correct'
          : 'finish';
      const updated = performHostSessionAction(
        String(req.params.id || ''),
        hostSecret,
        action
      );
      res.json(updated);
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 400;
      const message = err instanceof Error ? err.message : 'تعذّر تنفيذ إجراء المضيف.';
      res.status(statusCode).json({ code: 'wk/host-action-failed', error: message });
    }
  });

  // Mobile Player: single-use QR claim (locks to claiming device, burns QR secret)
  app.post('/api/wala-kalima/sessions/:id/claim', (req: Request, res: Response) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const state = claimWalaKalimaQrSession({
        sessionId: String(req.params.id || ''),
        qrToken: typeof body.qrToken === 'string' ? body.qrToken.trim() : undefined,
        playerToken:
          typeof body.playerToken === 'string' ? body.playerToken.trim() : undefined,
      });
      res.json(state);
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 400;
      const message = err instanceof Error ? err.message : 'تعذّر الانضمام إلى الجولة.';
      res.status(statusCode).json({ code: 'wk/claim-failed', error: message });
    }
  });

  // Mobile Player: correct / skip / finish / sync
  app.post('/api/wala-kalima/sessions/:id/player-action', (req: Request, res: Response) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const authHeader = req.headers.authorization || '';
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const playerToken = String(
        bearerMatch?.[1] || body.playerToken || ''
      ).trim();
      const rawAction = String(body.action || '');
      if (!['correct', 'skip', 'finish', 'sync'].includes(rawAction)) {
        res.status(400).json({ code: 'wk/invalid-action', error: 'إجراء غير صالح.' });
        return;
      }
      const state = performPlayerSessionAction({
        sessionId: String(req.params.id || ''),
        playerToken,
        action: rawAction as 'correct' | 'skip' | 'finish' | 'sync',
      });
      res.json(state);
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 400;
      const message = err instanceof Error ? err.message : 'تعذّر تحديث حالة الجولة.';
      res.status(statusCode).json({ code: 'wk/player-action-failed', error: message });
    }
  });

  // Unknown /api/* JSON fallback so API errors never return HTML
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      code: 'api/not-found',
      error: 'نقطة النهاية المطلوبة غير موجودة.',
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[NIZAL Express Server Error]', err);
    res.status(500).json({
      code: 'server/internal-error',
      error: 'حدث خطأ داخلي في الخادم أثناء معالجة الطلب.',
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { server: httpServer },
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir, { index: 'index.html' }));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[NIZAL Server] Running on http://0.0.0.0:${PORT} (mode=${process.env.NODE_ENV || 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[NIZAL Server Startup Failure]', err);
  process.exit(1);
});
