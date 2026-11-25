import type { IncomingMessage, ServerResponse } from 'node:http';
import { dispatchVercelOnlineRoomRoute } from './_vercelDispatch.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await dispatchVercelOnlineRoomRoute(req, res, []);
  } catch (err) {
    console.error('[NIZAL Vercel OnlineRoom Create Error]', err);
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
