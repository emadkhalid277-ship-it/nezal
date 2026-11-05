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
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (
      !validTypes.includes(file.type.toLowerCase()) &&
      !/\.(jpe?g|png|webp)$/i.test(file.name)
    ) {
      setErrorMsg('يرجى اختيار صورة بصيغة JPG أو JPEG أو PNG أو WEBP فقط.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImageElement(img);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      };
      img.onerror = () => {
        setErrorMsg('تعذر قراءة ملف الصورة. جرب صورة أخرى.');
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

  const handleConfirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement) return;

    // Export compressed WebP or JPEG
    let dataUrl = canvas.toDataURL('image/webp', 0.82);
    if (!dataUrl.startsWith('data:image/webp') || dataUrl.length > 420000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    }

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        await onConfirmSave(blob, dataUrl);
      },
      'image/webp',
      0.82
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="bg-[#14543D] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-[#F07842]">
              {categoryTypeLabel}
            </div>
            <h3 className="font-display text-lg font-bold">
              ضبط ومعاينة صورة الفئة: «{categoryLabel}»
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-xs font-bold text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Interactive Crop Canvas */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-[#252824]">
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
                  className="px-3 py-1.5 rounded-lg bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>اختيار صورة أخرى</span>
                </button>
              </div>

              <div className="relative aspect-square w-full max-w-[340px] mx-auto rounded-2xl overflow-hidden border-2 border-[#14543D] bg-[#F3F5E9] shadow-inner">
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
              <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-3.5 flex items-center gap-3">
                <ZoomOut className="w-4 h-4 text-[#777B73] shrink-0" />
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
                  className="px-2.5 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#252824] flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>توسيط</span>
                </button>
              </div>
            </div>

            {/* Live Card Preview & Current Image Comparison */}
            <div className="md:col-span-5 space-y-4">
              <div className="text-xs font-bold text-[#252824]">
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
                <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-3 flex items-center gap-3">
                  <img
                    src={currentImageUrl}
                    alt="الصورة الحالية"
                    className="w-12 h-12 rounded-lg object-cover border border-[#E5E8DD] shrink-0"
                  />
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-[#252824]">الصورة الحالية</div>
                    <div className="text-[#777B73]">
                      سيتم استبدالها بالصورة الجديدة عند الحفظ.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#F3F5E9] border-t border-[#E5E8DD] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#FFFFFF] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#252824] cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !imageElement}
            className="px-6 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer"
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
