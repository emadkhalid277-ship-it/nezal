import React, { useEffect, useState } from 'react';

interface CircularCountdownTimerProps {
  totalSeconds: number;
  remainingSeconds: number;
  expiresAt?: number | null;
  isActive?: boolean;
  size?: number;
  strokeWidth?: number;
  variant?: 'light' | 'dark';
  label?: string;
}

export const CircularCountdownTimer: React.FC<CircularCountdownTimerProps> = ({
  totalSeconds,
  remainingSeconds,
  expiresAt,
  isActive = true,
  size = 132,
  strokeWidth = 10,
  variant = 'light',
  label = 'ثانية',
}) => {
  const safeTotal = Math.max(1, totalSeconds);
  const [smoothRemainingMs, setSmoothRemainingMs] = useState<number>(
    Math.max(0, remainingSeconds * 1000)
  );

  useEffect(() => {
    if (!isActive || !expiresAt) {
      setSmoothRemainingMs(Math.max(0, remainingSeconds * 1000));
      return;
    }

    const tick = () => {
      setSmoothRemainingMs(Math.max(0, expiresAt - Date.now()));
    };

    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [isActive, expiresAt, remainingSeconds]);

  const displayedSeconds =
    isActive && expiresAt
      ? Math.max(0, Math.ceil(smoothRemainingMs / 1000))
      : Math.max(0, remainingSeconds);

  const progress = Math.max(
    0,
    Math.min(1, smoothRemainingMs / (safeTotal * 1000))
  );

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const isUrgent = isActive && displayedSeconds > 0 && displayedSeconds <= 10;
  const isWarning = isActive && displayedSeconds > 10 && displayedSeconds <= 18;

  const trackStroke =
    variant === 'dark' ? 'rgba(255, 255, 255, 0.16)' : '#E5E8DD';

  const progressStroke = isUrgent
    ? '#EF4444'
    : isWarning
    ? '#F07842'
    : variant === 'dark'
    ? '#86EFAC'
    : '#14543D';

  const numberColor = isUrgent
    ? variant === 'dark'
      ? 'text-[#FCA5A5]'
      : 'text-rose-600'
    : isWarning
    ? variant === 'dark'
      ? 'text-[#FDBA74]'
      : 'text-[#D9602B]'
    : variant === 'dark'
    ? 'text-white'
    : 'text-[#14543D]';

  const subTextColor =
    variant === 'dark' ? 'text-[#EAF2EE]/80' : 'text-[#52574E]';

  return (
    <div
      className="inline-flex flex-col items-center justify-center select-none"
      role="timer"
      aria-live="polite"
      aria-label={`الوقت المتبقي ${displayedSeconds} ${label}`}
    >
      <div
        className="relative flex items-center justify-center"
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

        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span
            className={`font-mono font-bold tabular-nums tracking-tight ${numberColor}`}
            style={{ fontSize: Math.round(size * 0.31) }}
          >
            {displayedSeconds}
          </span>
          <span
            className={`font-sans font-bold mt-1 ${subTextColor}`}
            style={{ fontSize: Math.max(10, Math.round(size * 0.1)) }}
          >
            {isUrgent ? 'الوقت ينفد!' : label}
          </span>
        </div>
      </div>
    </div>
  );
};
