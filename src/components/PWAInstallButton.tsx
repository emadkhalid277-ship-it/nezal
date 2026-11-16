import React from 'react';
import {
  Download,
  Share,
  PlusSquare,
  X,
  Smartphone,
  MonitorDown,
  MoreVertical,
  ExternalLink,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const {
    shouldShowHeaderButton,
    canPromptNative,
    isIOS,
    isInIframe,
    triggerInstall,
    showIOSModal,
    setShowIOSModal,
    showBrowserGuideModal,
    setShowBrowserGuideModal,
  } = usePWAInstall();

  if (!shouldShowHeaderButton) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void triggerInstall()}
        data-testid="navbar-pwa-install-btn"
        title={
          isIOS
            ? 'تعليمات إضافة تطبيق نِزال إلى الشاشة الرئيسية'
            : canPromptNative
            ? 'تثبيت تطبيق نِزال على جهازك مباشرة'
            : 'تنزيل وتثبيت تطبيق نِزال (PWA)'
        }
        aria-label="تنزيل التطبيق"
        className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 min-h-[38px] sm:min-h-[40px] py-1.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] active:scale-[0.98] text-white border border-[#14543D] text-[11px] sm:text-xs font-bold shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0"
      >
        <span>تنزيل التطبيق</span>
        <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F07842] shrink-0" />
      </button>

      {showIOSModal && (
        <IOSInstallGuideModal onClose={() => setShowIOSModal(false)} />
      )}

      {showBrowserGuideModal && (
        <BrowserInstallGuideModal
          canPromptNative={canPromptNative}
          isInIframe={isInIframe}
          onDirectInstall={() => void triggerInstall()}
          onClose={() => setShowBrowserGuideModal(false)}
        />
      )}
    </>
  );
};

export const NavbarPWAInstallButton = PWAInstallButton;

export const PWAInstallBanner: React.FC = () => {
  const {
    shouldShowBanner,
    isIOS,
    triggerInstall,
    dismissBanner,
    showIOSModal,
    setShowIOSModal,
  } = usePWAInstall();

  if (!shouldShowBanner) {
    return showIOSModal ? (
      <IOSInstallGuideModal onClose={() => setShowIOSModal(false)} />
    ) : null;
  }

  return (
    <>
      <div
        role="region"
        aria-label="تثبيت تطبيق نِزال"
        className="fixed bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-sm z-40 bg-[#FFFFFF] border-2 border-[#14543D]/25 rounded-2xl p-4 shadow-lg flex items-start gap-3"
      >
        <div className="w-11 h-11 rounded-xl bg-[#14543D] flex items-center justify-center shrink-0 overflow-hidden p-1">
          <img
            src="/pwa-192x192.png"
            alt="أيقونة نِزال"
            className="w-full h-full object-contain"
          />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold text-[#252824]">
                ثبّت تطبيق نِزال على جهازك
              </h3>
              <p className="text-xs text-[#777B73] leading-relaxed">
                {isIOS
                  ? 'أضفه إلى الشاشة الرئيسية للعب المحلي دون إنترنت بملء الشاشة.'
                  : 'وصول أسرع وتجربة تطبيق متكاملة مع اللعب المحلي دون إنترنت.'}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label="إغلاق إشعار التثبيت"
              className="p-1 rounded-lg text-[#777B73] hover:bg-[#F3F5E9] hover:text-[#252824] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void triggerInstall()}
              className="px-3.5 py-1.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isIOS ? 'طريقة التثبيت' : 'تثبيت الآن'}</span>
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9] cursor-pointer transition-colors"
            >
              لاحقاً
            </button>
          </div>
        </div>
      </div>

      {showIOSModal && (
        <IOSInstallGuideModal onClose={() => setShowIOSModal(false)} />
      )}
    </>
  );
};

export const IOSInstallGuideModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => (
  <div
    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    onClick={onClose}
    role="dialog"
    aria-modal="true"
    aria-label="تثبيت نِزال على iPhone و iPad"
  >
    <div
      className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl max-w-md w-full max-h-[90dvh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-2xl text-right"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#EAF2EE] text-[#14543D] flex items-center justify-center">
            <Smartphone className="w-5 h-5" />
          </div>
          <h3 className="font-display text-lg font-bold text-[#252824]">
            تثبيت نِزال على iPhone و iPad
          </h3>
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

      <p className="text-xs sm:text-sm text-[#777B73] leading-relaxed">
        لتشغيل نِزال كتطبيق مستقل واللعب محلياً دون إنترنت على أجهزة Apple، افتح
        الموقع عبر متصفح <strong>Safari</strong> واتبع الخطوات التالية:
      </p>

      <ol className="space-y-3 text-xs sm:text-sm text-[#252824]">
        <li className="p-3 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center gap-3">
          <span className="w-7 h-7 rounded-lg bg-[#14543D] text-white font-mono font-bold flex items-center justify-center shrink-0">
            1
          </span>
          <span className="flex items-center gap-1.5 flex-wrap">
            اضغط على زر <strong>المشاركة</strong>
            <Share className="w-4 h-4 text-[#14543D] inline" />
            في شريط متصفح Safari.
          </span>
        </li>
        <li className="p-3 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center gap-3">
          <span className="w-7 h-7 rounded-lg bg-[#F07842] text-white font-mono font-bold flex items-center justify-center shrink-0">
            2
          </span>
          <span className="flex items-center gap-1.5 flex-wrap">
            اختر <strong>إضافة إلى الصفحة الرئيسية</strong>
            <PlusSquare className="w-4 h-4 text-[#F07842] inline" />
            (Add to Home Screen).
          </span>
        </li>
        <li className="p-3 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center gap-3">
          <span className="w-7 h-7 rounded-lg bg-[#14543D] text-white font-mono font-bold flex items-center justify-center shrink-0">
            3
          </span>
          <span>
            اضغط <strong>إضافة (Add)</strong> ليظهر نِزال على شاشتك الرئيسية.
          </span>
        </li>
      </ol>

      <button
        type="button"
        onClick={onClose}
        className="w-full py-3 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-white text-sm font-bold cursor-pointer transition-colors"
      >
        حسناً، فهمت
      </button>
    </div>
  </div>
);

const BrowserInstallGuideModal: React.FC<{
  canPromptNative: boolean;
  isInIframe: boolean;
  onDirectInstall: () => void;
  onClose: () => void;
}> = ({ canPromptNative, isInIframe, onDirectInstall, onClose }) => (
  <div
    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    onClick={onClose}
    role="dialog"
    aria-modal="true"
    aria-label="تنزيل تطبيق نِزال"
  >
    <div
      className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl max-w-md w-full max-h-[90dvh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-2xl text-right"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#EAF2EE] text-[#14543D] flex items-center justify-center">
            <MonitorDown className="w-5 h-5" />
          </div>
          <h3 className="font-display text-lg font-bold text-[#252824]">
            تنزيل وتثبيت تطبيق نِزال
          </h3>
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

      {canPromptNative ? (
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-[#777B73] leading-relaxed">
            أصبح متصفحك جاهزاً لتثبيت تطبيق نِزال مباشرة على جهازك للعب المحلي دون
            إنترنت والوصول السريع.
          </p>
          <button
            type="button"
            onClick={onDirectInstall}
            className="w-full py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>تثبيت التطبيق الآن</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {isInIframe ? (
            <div className="p-3.5 rounded-2xl bg-[#FFF7ED] border border-[#F07842]/30 text-xs sm:text-sm text-[#252824] leading-relaxed flex items-start gap-2.5">
              <ExternalLink className="w-4 h-4 text-[#F07842] shrink-0 mt-0.5" />
              <span>
                أنت تتصفح التطبيق حالياً داخل نافذة معاينة. لتفعيل التثبيت
                المباشر، افتح رابط الموقع في علامة تبويب مستقلة في المتصفح ثم
                اضغط على <strong>تنزيل التطبيق</strong>.
              </span>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-[#777B73] leading-relaxed">
              إذا لم تظهر نافذة التثبيت التلقائية من المتصفح، يمكنك تثبيت تطبيق
              نِزال يدوياً في ثوانٍ عبر متصفحك:
            </p>
          )}

          <ol className="space-y-2.5 text-xs sm:text-sm text-[#252824]">
            <li className="p-3 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-[#14543D] text-white font-mono font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                اضغط على أيقونة التثبيت في شريط العنوان أو قائمة المتصفح
                <MoreVertical className="w-4 h-4 text-[#14543D] inline" />.
              </span>
            </li>
            <li className="p-3 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-[#F07842] text-white font-mono font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <span>
                اختر <strong>«تثبيت نِزال»</strong> أو{' '}
                <strong>«إضافة إلى الشاشة الرئيسية»</strong> (Install App / Add to
                Home Screen).
              </span>
            </li>
          </ol>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-white text-sm font-bold cursor-pointer transition-colors"
      >
        إغلاق
      </button>
    </div>
  </div>
);

export default PWAInstallButton;
