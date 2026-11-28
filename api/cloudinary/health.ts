import {
  handleCloudinaryHealthRequest,
  type ApiRequestLike,
  type ApiResponseLike,
} from './_cloudinarySignCore.bundle.mjs';

export default async function handler(
  req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void> {
  try {
    await handleCloudinaryHealthRequest(req, res);
  } catch (err) {
    console.error('[NIZAL Vercel Cloudinary Health Error]', err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          code: 'server/internal-error',
          error: 'حدث خطأ داخلي أثناء فحص حالة خدمة Cloudinary.',
        })
      );
    }
  }
}
