import type { IncomingMessage, ServerResponse } from 'node:http';
import { dispatchVercelOnlineRoomRoute } from './_vercelDispatch.ts';

interface VercelSlugRequest extends IncomingMessage {
  query?: { slug?: string | string[] };
}

export default async function handler(req: VercelSlugRequest, res: ServerResponse): Promise<void> {
  try {
    const rawSlug = req.query?.slug;
    const segments = Array.isArray(rawSlug)
      ? rawSlug
      : typeof rawSlug === 'string' && rawSlug.trim()
      ? rawSlug.split('/').filter(Boolean)
      : undefined;

    await dispatchVercelOnlineRoomRoute(req, res, segments);
  } catch (err) {
    console.error('[NIZAL Vercel OnlineRoom Action Error]', err);
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
