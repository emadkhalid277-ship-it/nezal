import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, Response } from 'express';
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
} from './_onlineDuelEngine.bundle.mjs';

interface VercelNodeRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

function readJsonBody(req: VercelNodeRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body as Record<string, unknown>);
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return Promise.resolve(JSON.parse(req.body) as Record<string, unknown>);
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total <= 65536) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function createExpressResShim(res: ServerResponse): Response {
  const shim = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return shim;
    },
    setHeader(name: string, value: string | string[]) {
      res.setHeader(name, value);
      return shim;
    },
    json(payload: unknown) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      if (!res.writableEnded) {
        res.end(JSON.stringify(payload));
      }
      return shim;
    },
  };
  return shim as unknown as Response;
}

export async function dispatchVercelOnlineRoomRoute(
  req: VercelNodeRequest,
  res: ServerResponse,
  segmentsOverride?: string[]
): Promise<void> {
  const expressRes = createExpressResShim(res);

  if (req.method !== 'POST') {
    expressRes.status(405).json({
      code: 'api/method-not-allowed',
      error: 'يُسمح فقط بطلبات POST لهذه النقطة.',
    });
    return;
  }

  const body = await readJsonBody(req);
  const rawUrl = (req.url || '/api/online-rooms').split('?')[0];
  const parsedFromUrl = rawUrl
    .replace(/^\/api\/online-rooms\/?/, '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  const segments =
    segmentsOverride ??
    (parsedFromUrl[0] === 'dispatch' ? parsedFromUrl.slice(1) : parsedFromUrl);

  const expressReq = {
    headers: req.headers,
    body,
    params: {
      code: segments[0] ? decodeURIComponent(segments[0]) : '',
    },
    method: req.method,
    url: req.url,
  } as unknown as Request;

  if (segments.length === 0) {
    await handleCreateOnlineRoom(expressReq, expressRes);
    return;
  }

  const action = segments.slice(1).join('/');
  switch (action) {
    case 'join':
      await handleJoinOnlineRoom(expressReq, expressRes);
      return;
    case 'presence':
      await handlePresenceUpdate(expressReq, expressRes);
      return;
    case 'leave':
      await handleLeaveOnlineRoom(expressReq, expressRes);
      return;
    case 'claim-host':
      await handleClaimHostRole(expressReq, expressRes);
      return;
    case 'categories/toggle':
      await handleToggleCategoryPick(expressReq, expressRes);
      return;
    case 'categories/confirm':
      await handleConfirmCategories(expressReq, expressRes);
      return;
    case 'start':
      await handleStartOnlineMatch(expressReq, expressRes);
      return;
    case 'select-question':
      await handleSelectQuestion(expressReq, expressRes);
      return;
    case 'submit-answer':
      await handleSubmitAnswer(expressReq, expressRes);
      return;
    case 'timeout-question':
      await handleTimeoutOrSkipQuestion(expressReq, expressRes);
      return;
    case 'dismiss-result':
      await handleDismissResolvedQuestion(expressReq, expressRes);
      return;
    case 'wala-kalima-sync':
      await handleWalaKalimaSyncState(expressReq, expressRes);
      return;
    case 'wala-kalima-commit':
      await handleWalaKalimaCommit(expressReq, expressRes);
      return;
    case 'finish':
      await handleFinishOnlineMatch(expressReq, expressRes);
      return;
    case 'restart':
      await handleRestartOnlineMatch(expressReq, expressRes);
      return;
    default:
      expressRes.status(404).json({
        code: 'api/not-found',
        error: 'نقطة النهاية المطلوبة غير موجودة.',
      });
  }
}
