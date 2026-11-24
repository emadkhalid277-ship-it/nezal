import {
  handleCloudinarySignRequest,
  type ApiRequestLike,
  type ApiResponseLike,
} from '../../server/cloudinarySignCore.ts';

export default async function handler(
  req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void> {
  try {
    await handleCloudinarySignRequest(req, res);
  } catch (err) {
    console.error('[NIZAL Vercel Cloudinary Sign Error]', err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          code: 'server/internal-error',
          error: 'حدث خطأ داخلي في الخادم أثناء إنشاء توقيع رفع الصورة.',
        })
      );
    }
  }
}
