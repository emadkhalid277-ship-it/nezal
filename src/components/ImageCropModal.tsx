import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  X,
  Move,
  Upload,
} from 'lucide-react';
import { validateQuestionImageFile } from '../utils/questionMedia';
import { AlertBanner } from './ui';

interface ImageCropModalProps {
  isOpen: boolean;
  categoryLabel: string;
  categoryTypeLabel: string;
  initialFile: File | null;
  currentImageUrl?: string;
  saving: boolean;
  onClose: () => void;
  onConfirmSave: (croppedBlob: Blob, croppedDataUrl: string) => Promise<void>;
}

const OUTPUT_SIZE = 600;

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  categoryLabel,
  categoryTypeLabel,
  initialFile,
  currentImageUrl,
  saving,
  onClose,
  onConfirmSave,
}) => {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null
  );
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  const loadFileIntoImage = useCallback((file: File) => {
    setErrorMsg(null);
    const validationError = validateQuestionImageFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setErrorMsg('تعذر قراءة ملف الصورة المختار من الجهاز.');
    };
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImageElement(img);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      };
      img.onerror = () => {
        setErrorMsg('تعذر قراءة ملف الصورة. جرب صورة أخرى بصيغة JPG أو PNG أو WEBP.');
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    if (isOpen && initialFile) {
      loadFileIntoImage(initialFile);
    } else if (!isOpen) {
      setImageElement(null);
      setPreviewDataUrl('');
      setErrorMsg(null);
    }
  }, [isOpen, initialFile, loadFileIntoImage]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, onClose]);

  // Draw the square cropped canvas whenever imageElement, zoom, or offset changes
  const renderCropCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    ctx.fillStyle = '#14543D';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    // Base cover scale so the shortest side fills OUTPUT_SIZE at zoom = 1
    const baseScale = Math.max(
      OUTPUT_SIZE / imageElement.width,
      OUTPUT_SIZE / imageElement.height
    );
    const finalScale = baseScale * zoom;

    const drawWidth = imageElement.width * finalScale;
    const drawHeight = imageElement.height * finalScale;

    const drawX = (OUTPUT_SIZE - drawWidth) / 2 + offset.x;
    const drawY = (OUTPUT_SIZE - drawHeight) / 2 + offset.y;

    ctx.drawImage(imageElement, drawX, drawY, drawWidth, drawHeight);

    try {
      const webpUrl = canvas.toDataURL('image/webp', 0.82);
      if (webpUrl.startsWith('data:image/webp')) {
        setPreviewDataUrl(webpUrl);
      } else {
        setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.82));
      }
    } catch {
      // ignore taint errors for external URLs
    }
  }, [imageElement, zoom, offset]);

  useEffect(() => {
    renderCropCanvas();
  }, [renderCropCanvas]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageElement) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging || !imageElement) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  const exportCanvasBlob = (
    canvas: HTMLCanvasElement,
    mime: 'image/webp' | 'image/jpeg',
    quality: number
  ): Promise<Blob | null> =>
    new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), mime, quality);
    });

  const handleConfirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement || saving) return;
    setErrorMsg(null);

    let dataUrl = canvas.toDataURL('image/webp', 0.82);
    let preferredMime: 'image/webp' | 'image/jpeg' = 'image/webp';
    let quality = 0.82;
    if (!dataUrl.startsWith('data:image/webp') || dataUrl.length > 420000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      preferredMime = 'image/jpeg';
    }

    let blob = await exportCanvasBlob(canvas, preferredMime, quality);
    if (!blob && preferredMime === 'image/webp') {
      dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      blob = await exportCanvasBlob(canvas, 'image/jpeg', 0.82);
    }

    if (!blob || blob.size <= 0) {
      setErrorMsg('تعذر تجهيز ملف الصورة بعد القص. يرجى تجربة صورة أخرى.');
      return;
    }

    try {
      await onConfirmSave(blob, dataUrl);
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : 'تعذر رفع أو حفظ الصورة. يرجى المحاولة مرة أخرى.'
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`ضبط ومعاينة صورة الفئة: ${categoryLabel}`}
      dir="rtl"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-2xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="bg-[#14543D] text-white px-5 sm:px-6 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#F07842]">
              {categoryTypeLabel}
            </div>
            <h3 className="font-display text-base sm:text-lg font-bold truncate">
              ضبط ومعاينة صورة الفئة: «{categoryLabel}»
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl text-white/85 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer disabled:opacity-40 transition-colors shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Interactive Crop Canvas */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#1B1F1C]">
                <span className="flex items-center gap-1.5">
                  <Move className="w-4 h-4 text-[#14543D]" />
                  <span>اسحب الصورة لضبط مكانها داخل المربع</span>
                </span>

                <input
                  ref={filePickerRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) loadFileIntoImage(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => filePickerRef.current?.click()}
                  className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl bg-[#F7F8F1] hover:bg-[#E5E8DD]/70 border border-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>اختيار صورة أخرى</span>
                </button>
              </div>

              <div className="relative aspect-square w-full max-w-[340px] mx-auto rounded-2xl overflow-hidden border-2 border-[#14543D] bg-[#F7F8F1] shadow-inner">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="w-full h-full cursor-move touch-none block"
                />
                {/* Rule-of-thirds subtle crop guide */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <div className="border-l border-b border-white/25" />
                  <div className="border-l border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-l border-b border-white/25" />
                  <div className="border-l border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-l border-white/25" />
                  <div className="border-l border-white/25" />
                  <div />
                </div>
              </div>

              {/* Zoom & Reset Controls */}
              <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl p-3.5 flex items-center gap-3">
                <ZoomOut className="w-4 h-4 text-[#52574E] shrink-0" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-[#14543D] cursor-pointer"
                  aria-label="تكبير وتصغير الصورة"
                />
                <ZoomIn className="w-4 h-4 text-[#14543D] shrink-0" />
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                  title="إعادة ضبط التوسيط"
                  className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#E5E8DD]/70 border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>توسيط</span>
                </button>
              </div>
            </div>

            {/* Live Card Preview & Current Image Comparison */}
            <div className="md:col-span-5 space-y-4">
              <div className="text-xs font-bold text-[#1B1F1C]">
                معاينة شكل البطاقة قبل الحفظ:
              </div>

              <div className="relative aspect-square w-full max-w-[240px] mx-auto rounded-2xl overflow-hidden border-2 border-[#F07842] shadow-md flex flex-col justify-end">
                {previewDataUrl ? (
                  <img
                    src={previewDataUrl}
                    alt={categoryLabel}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#14543D]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#131614]/90 via-[#131614]/25 to-transparent" />
                <div className="relative z-10 p-4 text-right">
                  <div className="font-display text-lg font-bold text-white">
                    {categoryLabel}
                  </div>
                  <div className="text-[11px] font-bold text-[#F07842]">
                    معاينة مباشرة ✓
                  </div>
                </div>
              </div>

              {currentImageUrl && (
                <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl p-3 flex items-center gap-3">
                  <img
                    src={currentImageUrl}
                    alt="الصورة الحالية"
                    className="w-12 h-12 rounded-lg object-cover border border-[#E5E8DD] shrink-0"
                  />
                  <div className="text-xs space-y-0.5 min-w-0">
                    <div className="font-bold text-[#1B1F1C]">الصورة الحالية</div>
                    <div className="text-[#52574E]">
                      سيتم استبدالها بالصورة الجديدة عند الحفظ.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-4 bg-[#F7F8F1] border-t border-[#E5E8DD] flex flex-wrap items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[44px] sm:min-h-[42px] px-5 py-2 rounded-xl bg-[#FFFFFF] hover:bg-[#E5E8DD]/70 border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] cursor-pointer disabled:opacity-50 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !imageElement}
            className="min-h-[44px] sm:min-h-[42px] px-6 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>
              {saving ? 'جاري الرفع والحفظ...' : 'حفظ واعتماد الصورة'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
