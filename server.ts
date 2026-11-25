import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  checkIsAdminUser,
  handleCloudinaryHealthRequest,
  handleCloudinarySignRequest,
  verifyFirebaseIdToken,
  type VerifiedFirebaseUser,
} from './server/cloudinarySignCore.ts';
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
import {
  handleClaimHostRole,
  handleConfirmCategories,
  handleCreateOnlineRoom,
  handleDismissResolvedQuestion,
  handleFinishOnlineMatch,
  handleJoinOnlineRoom,
  handleLeaveOnlineRoom,
  handlePresenceUpdate,
  handleRestartOnlineMatch,
  handleSelectQuestion,
  handleStartOnlineMatch,
  handleSubmitAnswer,
  handleTimeoutOrSkipQuestion,
  handleToggleCategoryPick,
  handleWalaKalimaCommit,
  handleWalaKalimaSyncState,
} from './server/onlineDuelEngine.ts';
import type { WalaKalimaContentTypeId } from './src/types/walaKalima.ts';
import type { DifficultyLevel } from './src/types/game.ts';

const ROOT_DIR = path.resolve(import.meta.dirname);
const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Health/status check (never returns secret values)
  app.get('/api/cloudinary/health', async (req: Request, res: Response) => {
    await handleCloudinaryHealthRequest(req, res);
  });

  // Signed upload signature generator (API Secret never leaves the server)
  app.post('/api/cloudinary/sign', async (req: Request, res: Response) => {
    await handleCloudinarySignRequest(req, res);
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

  // =========================================================================
  // HOST-VS-GUEST TURN-BASED ONLINE DUEL API
  // =========================================================================
  app.post('/api/online-rooms', handleCreateOnlineRoom);
  app.post('/api/online-rooms/:code/join', handleJoinOnlineRoom);
  app.post('/api/online-rooms/:code/presence', handlePresenceUpdate);
  app.post('/api/online-rooms/:code/leave', handleLeaveOnlineRoom);
  app.post('/api/online-rooms/:code/claim-host', handleClaimHostRole);
  app.post('/api/online-rooms/:code/categories/toggle', handleToggleCategoryPick);
  app.post('/api/online-rooms/:code/categories/confirm', handleConfirmCategories);
  app.post('/api/online-rooms/:code/start', handleStartOnlineMatch);
  app.post('/api/online-rooms/:code/select-question', handleSelectQuestion);
  app.post('/api/online-rooms/:code/submit-answer', handleSubmitAnswer);
  app.post('/api/online-rooms/:code/timeout-question', handleTimeoutOrSkipQuestion);
  app.post('/api/online-rooms/:code/dismiss-result', handleDismissResolvedQuestion);
  app.post('/api/online-rooms/:code/wala-kalima-sync', handleWalaKalimaSyncState);
  app.post('/api/online-rooms/:code/wala-kalima-commit', handleWalaKalimaCommit);
  app.post('/api/online-rooms/:code/finish', handleFinishOnlineMatch);
  app.post('/api/online-rooms/:code/restart', handleRestartOnlineMatch);

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
