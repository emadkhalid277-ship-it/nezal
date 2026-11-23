import { auth } from '../lib/firebase';
import {
  isValidHttpUrl,
  resolveQuestionImageMeta,
  validateQuestionImageFile,
} from '../utils/questionMedia';

export type CloudinaryUploadScope =
  | 'admin_question'
  | 'admin_category'
  | 'user_question';

interface CloudinarySignResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  allowedFormats: string;
}

interface CloudinaryUploadApiResponse {
  secure_url?: string;
  public_id?: string;
  error?: {
    message?: string;
  };
}

export async function uploadCategoryImageToCloudinarySigned(
  croppedBlob: Blob,
  options: {
    categoryType: 'main' | 'sub';
    categoryId: string;
  }
): Promise<{ imageUrl: string; imageStoragePath: string }> {
  const rawType = (croppedBlob.type || '').toLowerCase();
  const mime =
    rawType === 'image/png' || rawType === 'image/jpeg' || rawType === 'image/webp'
      ? rawType
      : 'image/webp';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
  const safeId = options.categoryId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || 'cat';
  const file =
    croppedBlob instanceof File
      ? croppedBlob
      : new File([croppedBlob], `${options.categoryType}-${safeId}.${ext}`, {
          type: mime,
        });

  return uploadQuestionImageToCloudinarySigned(file, {
    scope: 'admin_category',
    folderHint: options.categoryType === 'main' ? 'main' : 'sub',
    questionIdHint: safeId,
  });
}

export async function uploadQuestionImageToCloudinarySigned(
  file: File,
  options: {
    scope: CloudinaryUploadScope;
    folderHint?: string;
    questionIdHint?: string;
  }
): Promise<{ imageUrl: string; imageStoragePath: string }> {
  const validationError = validateQuestionImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  // 1. Read and verify file bytes before requesting signature or uploading
  try {
    const buffer = await file.arrayBuffer();
    if (!buffer || buffer.byteLength <= 0) {
      throw new Error('تعذر قراءة ملف الصورة المختار أو أن الملف فارغ.');
    }
  } catch (readErr) {
    throw new Error(
      readErr instanceof Error && readErr.message
        ? readErr.message
        : 'تعذر قراءة ملف الصورة المختار من الجهاز.'
    );
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error(
      '[auth/unauthenticated] يجب تسجيل الدخول أولًا قبل رفع الصورة.'
    );
  }

  let idToken = '';
  try {
    idToken = await currentUser.getIdToken();
  } catch (tokenErr) {
    console.error('[NIZAL Cloudinary Auth Token Error]', tokenErr);
    throw new Error(
      '[auth/token-failed] تعذر التحقق من جلسة المستخدم الحالية. يرجى إعادة تسجيل الدخول والمحاولة مرة أخرى.'
    );
  }

  const { contentType } = resolveQuestionImageMeta(file);

  // 2. Request temporary upload signature from backend API (API Secret never enters browser)
  const signController = new AbortController();
  const signTimeout = setTimeout(() => signController.abort(), 12000);
  let signData: CloudinarySignResponse;

  try {
    const signRes = await fetch('/api/cloudinary/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        scope: options.scope,
        folderHint: options.folderHint || 'general',
        questionIdHint: options.questionIdHint || '',
        mimeType: contentType,
        fileSize: file.size,
      }),
      signal: signController.signal,
    });
    clearTimeout(signTimeout);

    const parsedBody = (await signRes.json().catch(() => ({}))) as Partial<
      CloudinarySignResponse & { error?: string; code?: string }
    >;

    if (!signRes.ok) {
      const code = parsedBody.code || `http_${signRes.status}`;
      const message =
        parsedBody.error ||
        `تعذر الحصول على توقيع الرفع الآمن من الخادم (HTTP ${signRes.status}).`;
      console.error('[NIZAL Cloudinary Sign Error]', {
        status: signRes.status,
        code,
        message,
        scope: options.scope,
      });
      throw new Error(`[${code}] ${message}`);
    }

    if (
      !parsedBody.cloudName ||
      !parsedBody.apiKey ||
      !parsedBody.signature ||
      !parsedBody.timestamp ||
      !parsedBody.folder ||
      !parsedBody.publicId
    ) {
      throw new Error(
        '[cloudinary/invalid-sign-response] استجابة توقيع الرفع من الخادم غير مكتملة.'
      );
    }

    signData = parsedBody as CloudinarySignResponse;
  } catch (err) {
    clearTimeout(signTimeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        '[cloudinary/sign-timeout] انتهت مهلة الاتصال بالخادم لتجهيز رفع الصورة. تأكد من استقرار الاتصال بالإنترنت وأعد المحاولة.'
      );
    }
    if (err instanceof TypeError) {
      console.error('[NIZAL Cloudinary Sign Network Error]', err);
      throw new Error(
        '[cloudinary/sign-network] تعذر الاتصال بخادم التطبيق لتجهيز رفع الصورة. تحقق من اتصال الإنترنت وأعد المحاولة.'
      );
    }
    throw err;
  }

  // 3. Upload file directly to Cloudinary using the signed parameters
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signData.apiKey);
  formData.append('timestamp', String(signData.timestamp));
  formData.append('signature', signData.signature);
  formData.append('folder', signData.folder);
  formData.append('public_id', signData.publicId);
  formData.append('allowed_formats', signData.allowedFormats || 'jpg,jpeg,png,webp');

  const uploadEndpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
    signData.cloudName
  )}/image/upload`;
  const uploadController = new AbortController();
  const uploadTimeout = setTimeout(() => uploadController.abort(), 25000);

  try {
    const uploadRes = await fetch(uploadEndpoint, {
      method: 'POST',
      body: formData,
      signal: uploadController.signal,
    });
    clearTimeout(uploadTimeout);

    const result = (await uploadRes.json().catch(() => ({}))) as CloudinaryUploadApiResponse;
    if (!uploadRes.ok) {
      const apiMsg = result?.error?.message || `HTTP ${uploadRes.status}`;
      console.error('[NIZAL Cloudinary Upload Error]', {
        status: uploadRes.status,
        apiMsg,
        cloudName: signData.cloudName,
        folder: signData.folder,
        publicId: signData.publicId,
        fileName: file.name,
        fileSize: file.size,
      });
      throw new Error(
        `[cloudinary/upload-failed | HTTP ${uploadRes.status}] تعذر رفع الصورة إلى Cloudinary: ${apiMsg}`
      );
    }

    const secureUrl = typeof result.secure_url === 'string' ? result.secure_url.trim() : '';
    if (!isValidHttpUrl(secureUrl)) {
      throw new Error(
        '[cloudinary/invalid-url] لم يتم استلام رابط HTTPS صالح للصورة من Cloudinary.'
      );
    }

    const publicId = typeof result.public_id === 'string' ? result.public_id.trim() : '';
    return {
      imageUrl: secureUrl.slice(0, 2000),
      imageStoragePath: publicId ? `cloudinary:${publicId}`.slice(0, 500) : '',
    };
  } catch (err) {
    clearTimeout(uploadTimeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        '[cloudinary/upload-timeout] انتهت مهلة رفع الصورة إلى Cloudinary. تحقق من سرعة الإنترنت ثم أعد المحاولة.'
      );
    }
    if (err instanceof TypeError) {
      console.error('[NIZAL Cloudinary Upload Network Error]', err);
      throw new Error(
        '[cloudinary/network-error] فشل الاتصال بخادم Cloudinary أثناء رفع الصورة. تحقق من اتصال الإنترنت وأعد المحاولة.'
      );
    }
    throw err;
  }
}
