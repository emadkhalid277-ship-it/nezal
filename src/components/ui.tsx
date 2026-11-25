import React, { useEffect, useId } from 'react';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from 'lucide-react';

export const UI_CLASSES = {
  card: 'bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl',
  cardLg: 'bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl',
  cardTinted: 'bg-[#F7F8F1] border border-[#E5E8DD] rounded-2xl',
  input:
    'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-sm text-[#1B1F1C] placeholder:text-[#666B62] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 transition-colors',
  inputSoft:
    'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-sm text-[#1B1F1C] placeholder:text-[#666B62] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 transition-colors',
  btnPrimary:
    'min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] focus-visible:ring-offset-2',
  btnDark:
    'min-h-[44px] px-5 py-2.5 rounded-xl bg-[#1B1F1C] hover:bg-[#2F3530] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] focus-visible:ring-offset-2',
  btnGreen:
    'min-h-[44px] px-5 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14543D] focus-visible:ring-offset-2',
  btnNeutral:
    'min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E7EAD8] border border-[#E5E8DD] text-[#1B1F1C] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842]',
  btnOutline:
    'min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FFFFFF] hover:bg-[#F7F8F1] border border-[#E5E8DD] hover:border-[#F07842]/50 text-[#1B1F1C] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842]',
  btnDanger:
    'min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2',
} as const;

export type ModalMaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
export type ModalHeaderTone = 'dark' | 'light' | 'orange' | 'green' | 'danger';

const MAX_WIDTH_MAP: Record<ModalMaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

const HEADER_TONE_MAP: Record<ModalHeaderTone, string> = {
  dark: 'bg-[#1B1F1C] text-white border-b border-white/10',
  light: 'bg-[#F7F8F1] text-[#1B1F1C] border-b border-[#E5E8DD]',
  orange: 'bg-[#F07842] text-white border-b border-white/15',
  green: 'bg-[#14543D] text-white border-b border-white/15',
  danger: 'bg-rose-700 text-white border-b border-white/15',
};

export interface ModalShellProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  headerTone?: ModalHeaderTone;
  maxWidth?: ModalMaxWidth;
  zIndexClass?: string;
  closeDisabled?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  closeButtonLabel?: string;
  footer?: React.ReactNode;
  bodyClassName?: string;
  containerClassName?: string;
  hideHeader?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  headerTone = 'dark',
  maxWidth = 'md',
  zIndexClass = 'z-50',
  closeDisabled = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  closeButtonLabel = 'إغلاق',
  footer,
  bodyClassName = 'p-4 sm:p-6 overflow-y-auto flex-1',
  containerClassName = '',
  hideHeader = false,
  ariaLabel,
  children,
}) => {
  const titleId = useId();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabled) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, closeDisabled, onClose]);

  if (!isOpen) return null;

  const isLightHeader = headerTone === 'light';

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/65 backdrop-blur-xs`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={!hideHeader && title ? titleId : undefined}
        aria-label={ariaLabel}
        dir="rtl"
        onClick={() => {
          if (closeOnBackdrop && !closeDisabled && onClose) {
            onClose();
          }
        }}
      >
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full ${MAX_WIDTH_MAP[maxWidth]} max-h-[94dvh] sm:max-h-[92dvh] flex flex-col bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-3xl shadow-2xl overflow-hidden text-right ${containerClassName}`}
        >
          {!hideHeader && (
            <div
              className={`px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0 ${HEADER_TONE_MAP[headerTone]}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {icon && <span className="shrink-0 flex items-center">{icon}</span>}
                <div className="min-w-0">
                  {title && (
                    <h2
                      id={titleId}
                      className={`font-display text-sm sm:text-base font-bold leading-snug truncate ${
                        isLightHeader ? 'text-[#1B1F1C]' : 'text-white'
                      }`}
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p
                      className={`text-[11px] leading-snug truncate mt-0.5 ${
                        isLightHeader ? 'text-[#52574E]' : 'text-white/75'
                      }`}
                    >
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>

              {showCloseButton && onClose && (
                <button
                  type="button"
                  disabled={closeDisabled}
                  onClick={onClose}
                  aria-label={closeButtonLabel}
                  className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] ${
                    isLightHeader
                      ? 'bg-[#FFFFFF] hover:bg-[#E5E8DD]/70 text-[#52574E] hover:text-[#1B1F1C] border border-[#E5E8DD]'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <X className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{closeButtonLabel}</span>
                </button>
              )}
            </div>
          )}

          <div className={bodyClassName}>{children}</div>

          {footer && (
            <div className="px-4 sm:px-6 py-3.5 bg-[#F7F8F1] border-t border-[#E5E8DD] shrink-0">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
};

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'green';
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  tone = 'danger',
  loading = false,
}) => {
  const headerTone: ModalHeaderTone =
    tone === 'danger' ? 'danger' : tone === 'green' ? 'green' : 'dark';
  const confirmBtnClass =
    tone === 'danger'
      ? UI_CLASSES.btnDanger
      : tone === 'green'
      ? UI_CLASSES.btnGreen
      : UI_CLASSES.btnPrimary;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={<AlertTriangle className="w-4 h-4" />}
      headerTone={headerTone}
      maxWidth="sm"
      zIndexClass="z-60"
      closeDisabled={loading}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className={`${UI_CLASSES.btnOutline} w-full sm:w-auto text-xs`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className={`${confirmBtnClass} w-full sm:w-auto text-xs`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      }
    >
      <div className="text-sm text-[#1B1F1C] leading-relaxed">{message}</div>
    </ModalShell>
  );
};

export type AlertTone = 'success' | 'error' | 'warning' | 'info';

export interface AlertBannerProps {
  tone?: AlertTone;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const ALERT_STYLES: Record<AlertTone, string> = {
  success: 'bg-[#EAF2EE] border-[#14543D]/30 text-[#14543D]',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  warning: 'bg-[#FEF2EC] border-[#F07842]/45 text-[#1B1F1C]',
  info: 'bg-[#F7F8F1] border-[#E5E8DD] text-[#1B1F1C]',
};

export const AlertBanner: React.FC<AlertBannerProps> = ({
  tone = 'info',
  children,
  onDismiss,
  className = '',
}) => {
  const IconComp =
    tone === 'success'
      ? CheckCircle2
      : tone === 'error' || tone === 'warning'
      ? AlertTriangle
      : Info;

  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={`rounded-2xl border px-4 py-3 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 ${ALERT_STYLES[tone]} ${className}`}
    >
      <div className="flex items-start sm:items-center gap-2.5 min-w-0">
        <IconComp
          className={`w-4 h-4 shrink-0 mt-0.5 sm:mt-0 ${
            tone === 'warning' ? 'text-[#F07842]' : ''
          }`}
        />
        <div className="min-w-0 leading-relaxed">{children}</div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إغلاق التنبيه"
          className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl hover:bg-black/5 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export type BadgeTone = 'orange' | 'green' | 'neutral' | 'danger' | 'amber';

const BADGE_STYLES: Record<BadgeTone, string> = {
  orange: 'bg-[#FEF2EC] border-[#F07842]/30 text-[#D9602B]',
  green: 'bg-[#EAF2EE] border-[#14543D]/25 text-[#14543D]',
  neutral: 'bg-[#F3F5E9] border-[#E5E8DD] text-[#52574E]',
  danger: 'bg-rose-50 border-rose-200 text-rose-700',
  amber: 'bg-amber-50 border-amber-300/70 text-amber-800',
};

export interface StatusBadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone = 'neutral',
  children,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold leading-none tabular-nums ${BADGE_STYLES[tone]} ${className}`}
  >
    {children}
  </span>
);

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => (
  <div
    className={`bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-8 sm:p-12 text-center space-y-4 ${className}`}
  >
    <div className="w-14 h-14 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#52574E] flex items-center justify-center mx-auto">
      {icon}
    </div>
    <div className="space-y-1.5 max-w-md mx-auto">
      <h3 className="font-display text-base sm:text-lg font-bold text-[#1B1F1C]">
        {title}
      </h3>
      {description && (
        <p className="text-xs sm:text-sm text-[#52574E] leading-relaxed">
          {description}
        </p>
      )}
    </div>
    {action && <div className="pt-1 flex justify-center">{action}</div>}
  </div>
);

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'جاري التحميل...',
  className = '',
}) => (
  <div
    className={`bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-10 sm:p-12 text-center space-y-3 ${className}`}
  >
    <Loader2 className="w-7 h-7 animate-spin text-[#F07842] mx-auto" />
    <p className="text-xs sm:text-sm font-semibold text-[#52574E]">{message}</p>
  </div>
);
