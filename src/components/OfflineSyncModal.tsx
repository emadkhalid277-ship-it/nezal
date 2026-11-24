import React from 'react';
import { WifiOff, RefreshCw, Globe, Database } from 'lucide-react';
import { ModalShell, UI_CLASSES } from './ui';

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
  const isInitialNeeded = mode === 'needs_initial_download';

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        isInitialNeeded
          ? 'تنزيل بيانات اللعب المحلي مطلوب'
          : 'يتطلب اللعب عن بُعد اتصالاً بالإنترنت'
      }
      subtitle={isOnline ? 'الاتصال متوفر الآن' : 'لا يوجد اتصال بالإنترنت حالياً'}
      icon={
        <div className="w-9 h-9 rounded-xl bg-[#FEF2EC] border border-[#F07842]/25 text-[#F07842] flex items-center justify-center">
          {isInitialNeeded ? (
            <Database className="w-5 h-5" />
          ) : (
            <Globe className="w-5 h-5" />
          )}
        </div>
      }
      headerTone="light"
      maxWidth="md"
      closeDisabled={isSyncing}
      bodyClassName="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1"
      footer={
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
              className={`${UI_CLASSES.btnGreen} text-xs`}
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
              className={`${UI_CLASSES.btnPrimary} text-xs`}
            >
              اللعب المحلي دون إنترنت
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className={`${UI_CLASSES.btnOutline} text-xs`}
          >
            إغلاق
          </button>
        </div>
      }
    >
      <div className="p-4 rounded-2xl bg-[#F7F8F1] border border-[#E5E8DD] text-xs sm:text-sm text-[#1B1F1C] leading-relaxed space-y-2">
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
    </ModalShell>
  );
};
