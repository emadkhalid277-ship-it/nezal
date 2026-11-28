import type { IncomingMessage, ServerResponse } from 'node:http';
import { dispatchVercelOnlineRoomRoute } from './_vercelDispatch.ts';

interface VercelDispatchRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
}

function safeDecodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function extractSegmentsFromRequest(req: VercelDispatchRequest): string[] | undefined {
  const rawCode = req.query?.__code;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  if (typeof code === 'string' && code.trim() && code !== 'dispatch') {
    const rawAction = req.query?.__action;
    const actionList = Array.isArray(rawAction)
      ? rawAction
      : typeof rawAction === 'string'
      ? [rawAction]
      : [];
    const actionSegments = actionList
      .flatMap((part) => safeDecodeSegment(String(part)).split('/'))
      .map((s) => safeDecodeSegment(s).trim())
      .filter(Boolean);
    return [safeDecodeSegment(code).trim(), ...actionSegments];
  }

  const rawSlug = req.query?.slug;
  if (rawSlug) {
    const slugSegments = (Array.isArray(rawSlug) ? rawSlug : [rawSlug])
      .flatMap((part) => safeDecodeSegment(String(part)).split('/'))
      .map((s) => safeDecodeSegment(s).trim())
      .filter((s) => Boolean(s) && s !== 'dispatch');
    if (slugSegments.length > 0) {
      return slugSegments;
    }
  }

  return undefined;
}

export default async function handler(
  req: VercelDispatchRequest,
  res: ServerResponse
): Promise<void> {
  try {
    const segments = extractSegmentsFromRequest(req);
    await dispatchVercelOnlineRoomRoute(req, res, segments);
  } catch (err) {
    console.error('[NIZAL Vercel OnlineRoom Dispatch Error]', err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          code: 'server/internal-error',
          error: 'حدث خطأ داخلي في الخادم.',
        })
      );
    }
  }
}
