import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface QuestionAudioPlayerProps {
  audioUrl: string;
  maxPlays?: number | null;
  initialPlaysUsed?: number;
  onPlaysUsedChange?: (count: number) => void;
  onReadyChange?: (ready: boolean) => void;
  previewMode?: boolean;
  disabled?: boolean;
  questionKey?: string;
}

function formatAudioSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const QuestionAudioPlayer: React.FC<QuestionAudioPlayerProps> = ({
  audioUrl,
  maxPlays = null,
  initialPlaysUsed = 0,
  onPlaysUsedChange,
  onReadyChange,
  previewMode = false,
  disabled = false,
  questionKey,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRunRef = useRef<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playsUsed, setPlaysUsed] = useState<number>(initialPlaysUsed);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  const normalizedMaxPlays =
    typeof maxPlays === 'number' && Number.isFinite(maxPlays) && maxPlays > 0
      ? Math.round(maxPlays)
      : null;

  const remainingPlays =
    normalizedMaxPlays !== null
      ? Math.max(0, normalizedMaxPlays - playsUsed)
      : null;

  const isLimitReached =
    !previewMode &&
    normalizedMaxPlays !== null &&
    playsUsed >= normalizedMaxPlays;

  // Reset player state cleanly whenever the question or audio URL changes
  useEffect(() => {
    activeRunRef.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
    setIsLoading(Boolean(audioUrl));
    setPlaysUsed(initialPlaysUsed);
    onReadyChange?.(false);

    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          // ignore
        }
      }
    };
  }, [audioUrl, questionKey]);

  // Check if audio is already buffered in cache immediately after mount/retry
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (el.readyState >= 2) {
      setIsLoading(false);
      setHasError(false);
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
      onReadyChange?.(true);
    }
  }, [audioUrl, retryNonce]);

  const consumeOnePlay = () => {
    if (previewMode) return true;
    if (normalizedMaxPlays !== null && playsUsed >= normalizedMaxPlays) {
      return false;
    }
    const nextCount = playsUsed + 1;
    setPlaysUsed(nextCount);
    onPlaysUsedChange?.(nextCount);
    return true;
  };

  const handleTogglePlayPause = async () => {
    const el = audioRef.current;
    if (!el || disabled || hasError || isLoading) return;

    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
      return;
    }

    // Starting a new run if not currently paused mid-clip
    if (!activeRunRef.current) {
      if (!consumeOnePlay()) return;
      activeRunRef.current = true;
    }

    try {
      await el.play();
      setIsPlaying(true);
    } catch {
      // Playback blocked or failed
      setHasError(true);
      setIsPlaying(false);
      activeRunRef.current = false;
      onReadyChange?.(false);
    }
  };

  const handleRestart = async () => {
    const el = audioRef.current;
    if (!el || disabled || hasError || isLoading) return;

    // Restarting from 0:00 counts as a new play if not already mid-play?
    // To prevent unlimited replay loops on a 1-play question, restarting consumes a play unless a fresh run wasn't started yet.
    if (!previewMode && normalizedMaxPlays !== null) {
      if (playsUsed >= normalizedMaxPlays) {
        return;
      }
    }

    if (!activeRunRef.current || currentTime > 1.5) {
      if (!consumeOnePlay()) return;
      activeRunRef.current = true;
    }

    try {
      el.currentTime = 0;
      setCurrentTime(0);
      await el.play();
      setIsPlaying(true);
    } catch {
      setHasError(true);
      setIsPlaying(false);
      activeRunRef.current = false;
      onReadyChange?.(false);
    }
  };

  const handleRetryLoad = () => {
    setHasError(false);
    setIsLoading(true);
    setIsPlaying(false);
    activeRunRef.current = false;
    onReadyChange?.(false);
    setRetryNonce((n) => n + 1);
    if (audioRef.current) {
      try {
        audioRef.current.load();
      } catch {
        // ignore
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(duration) || duration <= 0) return;
    const nextTime = Number(e.target.value);
    el.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-4 sm:p-5 space-y-4 text-right"
      aria-label="مشغل المقطع الصوتي للسؤال"
    >
      <audio
        key={`${audioUrl}_${retryNonce}`}
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        playsInline
        onLoadStart={() => {
          setIsLoading(true);
          setHasError(false);
          onReadyChange?.(false);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setDuration(d);
          }
        }}
        onCanPlay={(e) => {
          setIsLoading(false);
          setHasError(false);
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setDuration(d);
          }
          onReadyChange?.(true);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime || 0);
        }}
        onEnded={() => {
          setIsPlaying(false);
          activeRunRef.current = false;
          setCurrentTime(0);
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
          }
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onPlay={() => {
          setIsPlaying(true);
        }}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
          setIsPlaying(false);
          activeRunRef.current = false;
          onReadyChange?.(false);
        }}
      />

      {/* Header metadata row (zero filenames / zero spoilers) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#14543D]">
          <span className="w-8 h-8 rounded-xl bg-[#14543D] text-white flex items-center justify-center shrink-0">
            <Volume2 className="w-4 h-4 text-[#F07842]" />
          </span>
          <span>مقطع صوتي للسؤال</span>
        </div>

        <div className="text-xs font-semibold text-[#777B73]">
          {previewMode ? (
            <span>
              {normalizedMaxPlays !== null
                ? `الحد المحدد للاعبين: ${normalizedMaxPlays} ${normalizedMaxPlays === 1 ? 'مرة' : 'مرات'}`
                : 'تشغيل غير محدود'}
            </span>
          ) : normalizedMaxPlays !== null ? (
            <span
              className={`font-bold ${
                remainingPlays === 0 ? 'text-rose-700' : 'text-[#F07842]'
              }`}
            >
              المتبقي للتشغيل: {remainingPlays} من {normalizedMaxPlays}
            </span>
          ) : (
            <span>تشغيل غير محدود</span>
          )}
        </div>
      </div>

      {/* Error State with Explicit Retry */}
      {hasError ? (
        <div className="bg-[#FFFFFF] border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-xs font-bold">
                تعذر تحميل أو تشغيل المقطع الصوتي
              </div>
              <p className="text-[11px] text-rose-700/90">
                تأكد من اتصال الإنترنت ثم اضغط على «إعادة المحاولة».
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRetryLoad}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      ) : (
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-3.5 sm:p-4 space-y-3.5">
          {/* Controls + Scrubber */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={
                  disabled ||
                  isLoading ||
                  (!isPlaying && !activeRunRef.current && isLimitReached)
                }
                onClick={handleTogglePlayPause}
                aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل الصوت'}
                className="flex-1 sm:flex-initial min-h-[44px] min-w-[124px] px-4 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] disabled:bg-[#E5E8DD] disabled:text-[#777B73] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحميل...</span>
                  </>
                ) : isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>إيقاف مؤقت</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {!activeRunRef.current && isLimitReached
                        ? 'انتهت مرات التشغيل'
                        : activeRunRef.current
                        ? 'متابعة التشغيل'
                        : 'تشغيل المقطع'}
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={
                  disabled ||
                  isLoading ||
                  (!previewMode &&
                    normalizedMaxPlays !== null &&
                    playsUsed >= normalizedMaxPlays)
                }
                onClick={handleRestart}
                aria-label="إعادة تشغيل المقطع من البداية"
                title="إعادة تشغيل المقطع من البداية"
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] disabled:opacity-45 text-[#252824] border border-[#E5E8DD] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4 text-[#F07842]" />
                <span>إعادة</span>
              </button>
            </div>

            {/* Scrubber & Time (LTR for consistent slider progress direction) */}
            <div className="flex-1 flex items-center gap-3 min-w-0" dir="ltr">
              <span className="font-mono tabular-nums text-xs font-bold text-[#252824] w-11 text-center shrink-0">
                {formatAudioSeconds(currentTime)}
              </span>

              <div className="relative flex-1 flex items-center">
                <div className="w-full h-2 rounded-full bg-[#E5E8DD] overflow-hidden">
                  <div
                    className="h-full bg-[#F07842] transition-all duration-100"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={duration > 0 ? duration : 0}
                  step={0.1}
                  value={Math.min(currentTime, duration || 0)}
                  disabled={disabled || isLoading || duration <= 0}
                  onChange={handleSeek}
                  aria-label="شريط تقدم المقطع الصوتي"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>

              <span className="font-mono tabular-nums text-xs font-semibold text-[#777B73] w-11 text-center shrink-0">
                {duration > 0 ? formatAudioSeconds(duration) : '--:--'}
              </span>
            </div>
          </div>

          {!previewMode && isLoading && (
            <div className="text-[11px] font-semibold text-[#14543D] flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F07842]" />
              <span>جاري تجهيز المقطع الصوتي — تم إيقاف المؤقت تلقائياً لحين الجاهزية</span>
            </div>
          )}

          {!previewMode && !isLoading && isLimitReached && !isPlaying && !activeRunRef.current && (
            <div className="text-[11px] font-bold text-[#F07842]">
              تم استنفاد الحد المسموح لتشغيل المقطع الصوتي لهذا السؤال.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
