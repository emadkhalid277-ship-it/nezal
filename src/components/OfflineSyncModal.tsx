import React from 'react';
import { WifiOff, RefreshCw, X, Globe, Database } from 'lucide-react';

interface OfflineSyncModalProps {
  isOpen: boolean;
  mode: 'needs_initial_download' | 'online_required_for_multiplayer';
  isOnline: boolean;
  isSyncing?: boolean;
  onRetrySync?: () => void;
  onSwitchToOfflineLocal?: () => void;
  onClose: () => void;
}

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = ({
  isOpen,
  mode,
  isOnline,
  isSyncing = false,
  onRetrySync,
  onSwitchToOfflineLocal,
  onClose,
}) => {
  if (!isOpen) return null;

  const isInitialNeeded = mode === 'needs_initial_download';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl max-w-md w-full max-h-[90dvh] overflow-y-auto p-5 sm:p-6 md:p-7 space-y-5 shadow-2xl text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FEF2EC] border border-[#F07842]/25 text-[#F07842] flex items-center justify-center shrink-0">
              {isInitialNeeded ? (
                <Database className="w-6 h-6" />
              ) : (
                <Globe className="w-6 h-6" />
              )}
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-[#252824]">
                {isInitialNeeded
                  ? 'تنزيل بيانات اللعب المحلي مطلوب'
                  : 'يتطلب اللعب عن بُعد اتصالاً بالإنترنت'}
              </h3>
              <p className="text-xs text-[#777B73]">
                {isOnline ? 'الاتصال متوفر الآن' : 'لا يوجد اتصال بالإنترنت حالياً'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-xl text-[#777B73] hover:bg-[#F3F5E9] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs sm:text-sm text-[#252824] leading-relaxed space-y-2">
          {isInitialNeeded ? (
            <>
              <p>
                بيانات الأسئلة والفئات غير محفوظة على جهازك بعد للعمل دون إنترنت.
              </p>
              <p className="font-semibold text-[#14543D]">
                يُرجى الاتصال بالإنترنت للمرة الأولى لتنزيل البيانات والصور محلياً،
                وبعدها يمكنك اللعب محلياً في أي وقت بدون إنترنت.
              </p>
            </>
          ) : (
            <>
              <p>
                مباريات اللعب عن بُعد (أونلاين) تعتمد على المزامنة الفورية بين
                أجهزة اللاعبين وتتطلب اتصالاً نشطاً بالإنترنت.
              </p>
              <p className="font-semibold text-[#14543D]">
                يمكنك الاتصال بالإنترنت للدخول للغرف، أو الاستمتاع فوراً بوضع «اللعب
                المحلي دون إنترنت» على نفس الجهاز.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F07842] ml-auto">
              <WifiOff className="w-4 h-4" />
              <span>غير متصل</span>
            </span>
          )}

          {isInitialNeeded && onRetrySync && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={onRetrySync}
              className="px-5 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {isOnline
                  ? isSyncing
                    ? 'جاري التنزيل...'
                    : 'تنزيل البيانات والبدء الآن'
                  : 'إعادة التحقق'}
              </span>
            </button>
          )}

          {!isInitialNeeded && onSwitchToOfflineLocal && (
            <button
              type="button"
              onClick={onSwitchToOfflineLocal}
              className="px-5 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold cursor-pointer"
            >
              اللعب المحلي دون إنترنت
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-xs font-bold text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9] cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
