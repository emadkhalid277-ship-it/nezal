import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';

interface NizalLoadingScreenProps {
  brandName?: string;
  variant?: 'fullscreen' | 'section';
  message?: string;
  subMessage?: string;
}

const DEFAULT_LOADING_STAGES = [
  'جاري تجهيز بنك الأسئلة...',
  'مزامنة الفئات والتحديات...',
  'إعداد لوحة المنافسة...',
];

const POINT_TILES = [
  { value: '100', accentBg: '#FFFFFF', accentText: '#14543D', borderColor: '#C5DDD1' },
  { value: '200', accentBg: '#F07842', accentText: '#FFFFFF', borderColor: '#F07842' },
  { value: '300', accentBg: '#14543D', accentText: '#FFFFFF', borderColor: '#14543D' },
];

export const NizalLoadingScreen: React.FC<NizalLoadingScreenProps> = ({
  brandName = 'نِزال',
  variant = 'fullscreen',
  message,
  subMessage = 'تجهيز الأسئلة والفئات لبدء التحدي',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [logoError, setLogoError] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (message || variant !== 'fullscreen') return;
    const interval = window.setInterval(() => {
      setStageIndex((prev) => (prev + 1) % DEFAULT_LOADING_STAGES.length);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [message, variant]);

  const activeMessage = message || DEFAULT_LOADING_STAGES[stageIndex];
  const isFullscreen = variant === 'fullscreen';

  return (
    <MotionConfig reducedMotion="user">
      <div
        dir="rtl"
        role="status"
        aria-live="polite"
        aria-label={activeMessage}
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#F3F5E9] px-5 py-8 text-[#252824] select-none'
            : 'min-h-[52vh] w-full flex flex-col items-center justify-center overflow-hidden py-16 px-4 text-center select-none'
        }
      >
        {/* Subtle Architectural Arena Backdrop (Fullscreen only) */}
        {isFullscreen && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 42%, rgba(20, 84, 61, 0.08) 0%, rgba(240, 120, 66, 0.03) 38%, rgba(243, 245, 233, 0) 72%)',
            }}
          />
        )}

        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex flex-col items-center text-center max-w-sm w-full"
        >
          {/* Animated NIZAL Geometric Arena Emblem */}
          <div
            className={`relative flex items-center justify-center ${
              isFullscreen ? 'w-32 h-32 sm:w-36 sm:h-36 mb-6' : 'w-24 h-24 mb-5'
            }`}
          >
            {/* Outer Orbital Geometric Ring */}
            <motion.div
              aria-hidden="true"
              animate={
                shouldReduceMotion
                  ? undefined
                  : { rotate: 360 }
              }
              transition={{
                duration: 14,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 rounded-[28px] border-2 border-dashed border-[#14543D]/25"
            />

            {/* Inner Counter-Rotating Arena Frame */}
            <motion.div
              aria-hidden="true"
              animate={
                shouldReduceMotion
                  ? undefined
                  : { rotate: -360 }
              }
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-2.5 rounded-[22px] border border-[#F07842]/45"
            />

            {/* Core Brand Crest */}
            <motion.div
              animate={
                shouldReduceMotion
                  ? undefined
                  : { scale: [1, 1.04, 1] }
              }
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className={`relative flex items-center justify-center rounded-2xl bg-[#124833] border-2 border-[#FFFFFF] shadow-lg overflow-hidden ${
                isFullscreen ? 'w-28 h-[74px] sm:w-32 sm:h-[84px]' : 'w-20 h-[54px]'
              }`}
            >
              {!logoError ? (
                <img
                  src="/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png"
                  alt={`شعار ${brandName}`}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-contain p-2 select-none"
                />
              ) : (
                <span className="font-display text-3xl font-bold text-[#F3F5E9]">
                  ن
                </span>
              )}
            </motion.div>
          </div>

          {/* Wordmark + Quiet Metadata Separator */}
          <div className="space-y-1.5 mb-6">
            <h1
              className={`font-display font-bold text-[#14543D] tracking-tight ${
                isFullscreen ? 'text-3xl sm:text-4xl' : 'text-2xl'
              }`}
            >
              {brandName}
            </h1>
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#777B73]">
              <span>تحدي</span>
              <span aria-hidden="true">·</span>
              <span>معرفة</span>
              <span aria-hidden="true">·</span>
              <span>منافسة جماعية</span>
            </div>
          </div>

          {/* Kinetic Trivia Board Point Tiles (100 · 200 · 300) */}
          <div
            aria-hidden="true"
            className="grid grid-cols-3 gap-2.5 w-full max-w-[230px] mb-6"
          >
            {POINT_TILES.map((tile, idx) => (
              <motion.div
                key={tile.value}
                animate={
                  shouldReduceMotion
                    ? undefined
                    : {
                        y: [0, -7, 0],
                        scale: [1, 1.05, 1],
                      }
                }
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  repeatDelay: 0.35,
                  delay: idx * 0.16,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  backgroundColor: tile.accentBg,
                  color: tile.accentText,
                  borderColor: tile.borderColor,
                }}
                className="py-2 rounded-xl border-2 font-mono tabular-nums text-xs sm:text-sm font-bold shadow-xs"
              >
                {tile.value}
              </motion.div>
            ))}
          </div>

          {/* Compositor-Only Sweep Progress Bar */}
          <div className="w-full max-w-[240px] h-1.5 rounded-full bg-[#E5E8DD] overflow-hidden mb-4">
            <motion.div
              aria-hidden="true"
              className="h-full w-full rounded-full bg-gradient-to-l from-[#14543D] via-[#F07842] to-[#14543D] origin-right"
              animate={
                shouldReduceMotion
                  ? { scaleX: 0.75 }
                  : {
                      scaleX: [0.15, 0.92, 0.25],
                      x: ['0%', '-12%', '0%'],
                    }
              }
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </div>

          {/* Dynamic Stage Copy */}
          <div className="min-h-[24px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={activeMessage}
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm sm:text-base font-bold text-[#14543D]"
              >
                {activeMessage}
              </motion.p>
            </AnimatePresence>
          </div>

          {isFullscreen && subMessage && (
            <p className="mt-1.5 text-xs text-[#777B73]">{subMessage}</p>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
};
