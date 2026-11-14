import { QuestionMediaType } from '../types/game';

export const ALLOWED_QUESTION_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];
export const MAX_QUESTION_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_QUESTION_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/webm',
];
export const MAX_QUESTION_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function inferQuestionMediaType(
  q?: {
    mediaType?: unknown;
    audioUrl?: unknown;
    imageUrl?: unknown;
  } | null
): QuestionMediaType {
  if (!q) return 'text';
  const hasAudio =
    typeof q.audioUrl === 'string' &&
    (q.audioUrl.trim().startsWith('http://') ||
      q.audioUrl.trim().startsWith('https://'));
  const hasImage =
    typeof q.imageUrl === 'string' &&
    (q.imageUrl.trim().startsWith('http://') ||
      q.imageUrl.trim().startsWith('https://'));

  if (q.mediaType === 'audio' && hasAudio) return 'audio';
  if (q.mediaType === 'image' && hasImage) return 'image';
  if (q.mediaType === 'text' && !hasAudio && !hasImage) return 'text';
  if (hasAudio) return 'audio';
  if (hasImage) return 'image';
  return 'text';
}

export function normalizeAudioMaxPlays(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.max(1, Math.min(20, Math.round(num)));
}

export function validateQuestionImageFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!file) {
    return 'لم يتم اختيار ملف صورة.';
  }
  const mime = (file.type || '').toLowerCase();
  const extMatch = file.name.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/);
  if (!ALLOWED_QUESTION_IMAGE_TYPES.includes(mime) && !extMatch) {
    return 'صيغة الصورة غير مدعومة. يرجى رفع صورة بصيغة JPG أو PNG أو WEBP فقط.';
  }
  if (file.size <= 0) {
    return 'ملف الصورة فارغ أو غير صالح.';
  }
  if (file.size > MAX_QUESTION_IMAGE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return `حجم الصورة (${sizeMb} ميجابايت) يتجاوز الحد الأقصى المسموح به وهو 5 ميجابايت.`;
  }
  return null;
}

export function validateQuestionAudioFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!file) {
    return 'لم يتم اختيار ملف صوتي.';
  }
  const mime = (file.type || '').toLowerCase();
  const extMatch = file.name.toLowerCase().match(/\.(mp3|wav|ogg|m4a|aac|webm)$/);
  if (!ALLOWED_QUESTION_AUDIO_TYPES.includes(mime) && !extMatch) {
    return 'صيغة الملف الصوتي غير مدعومة. يرجى رفع ملف MP3 أو WAV أو OGG أو M4A أو AAC أو WEBM فقط.';
  }
  if (file.size <= 0) {
    return 'الملف الصوتي فارغ أو غير صالح.';
  }
  if (file.size > MAX_QUESTION_AUDIO_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return `حجم الملف الصوتي (${sizeMb} ميجابايت) يتجاوز الحد الأقصى المسموح به وهو 10 ميجابايت.`;
  }
  return null;
}
