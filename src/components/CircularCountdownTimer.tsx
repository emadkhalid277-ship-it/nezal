import React, { useEffect, useRef, useState } from 'react';

interface CircularCountdownTimerProps {
  totalSeconds: number;
  remainingSeconds: number;
  expiresAt?: number | null;
  clockOffsetMs?: number;
  isActive?: boolean;
  isTimedOut?: boolean;
  onReachZero?: () => void;
  size?: number;
  strokeWidth?: number;
  variant?: 'light' | 'dark';
  label?: string;
  connectionWarning?: string | null;
}

export const CircularCountdownTimer: React.FC<CircularCountdownTimerProps> = ({
  totalSeconds,
  remainingSeconds,
  expiresAt,
  clockOffsetMs = 0,
  isActive = true,
  isTimedOut = false,
  onReachZero,
  size = 132,
  strokeWidth = 10,
  variant = 'light',
  label = 'ثانية',
  connectionWarning = null,
}) => {
  const safeTotal = Math.max(1, totalSeconds);
  const [smoothRemainingMs, setSmoothRemainingMs] = useState<number>(
    isTimedOut ? 0 : Math.max(0, remainingSeconds * 1000)
  );
  const onReachZeroRef = useRef(onReachZero);
  const reachedZeroForExpiresAtRef = useRef<number | null>(null);

  useEffect(() => {
    onReachZeroRef.current = onReachZero;
  }, [onReachZero]);

  useEffect(() => {
    if (isTimedOut) {
      setSmoothRemainingMs(0);
      return;
    }
    if (!isActive || !expiresAt) {
      setSmoothRemainingMs(Math.max(0, remainingSeconds * 1000));
      return;
    }

    const tick = () => {
      const serverAlignedNow = Date.now() + clockOffsetMs;
      const nextRemainingMs = Math.max(0, expiresAt - serverAlignedNow);
      setSmoothRemainingMs(nextRemainingMs);
      if (
        nextRemainingMs === 0 &&
        reachedZeroForExpiresAtRef.current !== expiresAt
      ) {
        reachedZeroForExpiresAtRef.current = expiresAt;
        onReachZeroRef.current?.();
      }
    };

    tick();
    const interval = window.setInterval(tick, 100);
    const handleResume = () => {
      if (!document.hidden) {
        tick();
      }
    };
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isActive, isTimedOut, expiresAt, clockOffsetMs, remainingSeconds]);

  const displayedSeconds = isTimedOut
    ? 0
    : isActive && expiresAt
    ? Math.max(0, Math.ceil(smoothRemainingMs / 1000))
    : Math.max(0, remainingSeconds);

  const progress = isTimedOut
    ? 0
    : Math.max(0, Math.min(1, smoothRemainingMs / (safeTotal * 1000)));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const hasTimedOut = isTimedOut || (isActive && Boolean(expiresAt) && displayedSeconds === 0);
  const isUrgent = !hasTimedOut && isActive && displayedSeconds > 0 && displayedSeconds <= 10;
  const isWarning = !hasTimedOut && isActive && displayedSeconds > 10 && displayedSeconds <= 15;

  const trackStroke =
    variant === 'dark' ? 'rgba(255, 255, 255, 0.14)' : '#E5E8DD';

  const progressStroke = hasTimedOut || isUrgent
    ? '#EF4444'
    : isWarning
    ? '#F07842'
    : variant === 'dark'
    ? '#F07842'
    : '#14543D';

  const numberColor = hasTimedOut || isUrgent
    ? variant === 'dark'
      ? 'text-[#FCA5A5]'
      : 'text-rose-600'
    : isWarning
    ? variant === 'dark'
      ? 'text-[#FDBA74]'
      : 'text-[#D9602B]'
    : variant === 'dark'
    ? 'text-white'
    : 'text-[#1B1F1C]';

  const subTextColor = hasTimedOut
    ? variant === 'dark'
      ? 'text-[#FCA5A5]'
      : 'text-rose-600'
    : variant === 'dark'
    ? 'text-white/75'
    : 'text-[#52574E]';

  const centerSubLabel = hasTimedOut
    ? 'انتهى الوقت!'
    : isUrgent
    ? 'الوقت ينفد!'
    : isWarning
    ? 'قارب الوقت'
    : label;

  return (
    <div
      className="inline-flex flex-col items-center justify-center select-none gap-1.5"
      role="timer"
      aria-live="polite"
      aria-label={
        hasTimedOut
          ? 'انتهى الوقت!'
          : `الوقت المتبقي ${displayedSeconds} ${label}`
      }
    >
      <div
        className={`relative flex items-center justify-center rounded-full transition-shadow duration-300 ${
          isUrgent
            ? 'animate-pulse ring-4 ring-rose-500/20'
            : isWarning
            ? 'ring-4 ring-[#F07842]/15'
            : ''
        }`}
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackStroke}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={progressStroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 100ms linear, stroke 200ms ease' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none text-center px-2">
          <span
            className={`font-mono font-extrabold tabular-nums tracking-tight ${numberColor}`}
            style={{ fontSize: Math.round(size * 0.32) }}
          >
            {displayedSeconds}
          </span>
          <span
            className={`font-sans font-bold mt-1 ${subTextColor}`}
            style={{ fontSize: Math.max(10, Math.round(size * 0.1)) }}
          >
            {centerSubLabel}
          </span>
        </div>
      </div>

      {connectionWarning && (
        <span
          className={`text-[11px] font-bold text-center ${
            variant === 'dark' ? 'text-[#FDBA74]' : 'text-[#D9602B]'
          }`}
        >
          {connectionWarning}
        </span>
      )}
    </div>
  );
};

