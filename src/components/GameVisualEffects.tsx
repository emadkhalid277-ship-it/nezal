import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Award, Scale, Sparkles, Trophy } from 'lucide-react';
import { VisualEffectsSettings } from '../types/game';
import {
  claimOneShotCelebrationKey,
  DEFAULT_VISUAL_EFFECTS_SETTINGS,
  EffectiveVisualEffects,
  resolveEffectiveVisualEffects,
  triggerCorrectParticles,
  triggerTieGoldenParticles,
  triggerWinnerConfetti,
} from '../services/visualEffectsService';
import { MatchOutcomeResult, MatchOutcomeTeamInput } from '../utils/matchOutcome';

export function useEffectiveVisualEffects(
  settings?: VisualEffectsSettings | null
): EffectiveVisualEffects {
  const prefersReduced = Boolean(useReducedMotion());
  return resolveEffectiveVisualEffects(
    settings ?? DEFAULT_VISUAL_EFFECTS_SETTINGS,
    prefersReduced
  );
}

/**
 * Returns subtle GPU-composited motion props for the question modal wrapper
 * when a real answer judgment occurs.
 */
export function getQuestionCardFeedbackAnimation(
  feedbackType: 'correct' | 'wrong' | null | undefined,
  effects: EffectiveVisualEffects
) {
  if (!effects.motion) {
    return { animate: { x: 0, scale: 1 }, transition: { duration: 0.15 } };
  }
  if (feedbackType === 'wrong' && effects.wrong) {
    return {
      animate: { x: [0, -6, 6, -4, 4, 0], scale: 1 },
      transition: { duration: 0.34, ease: 'easeInOut' as const },
    };
  }
  if (feedbackType === 'correct' && effects.correct) {
    return {
      animate: { x: 0, scale: [1, 1.014, 1] },
      transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
    };
  }
  return { animate: { x: 0, scale: 1 }, transition: { duration: 0.15 } };
}

interface AnimatedScoreCounterProps {
  value: number;
  className?: string;
  style?: React.CSSProperties;
  durationMs?: number;
  animateOnMount?: boolean;
  motionEnabled?: boolean;
  showDeltaBadge?: boolean;
}

/**
 * Smooth requestAnimationFrame score counter with optional floating +delta indicator
 * when points increase during active play.
 */
export const AnimatedScoreCounter: React.FC<AnimatedScoreCounterProps> = ({
  value,
  className = '',
  style,
  durationMs = 520,
  animateOnMount = false,
  motionEnabled = true,
  showDeltaBadge = false,
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const canAnimate = motionEnabled && !prefersReduced;

  const [displayValue, setDisplayValue] = useState<number>(
    animateOnMount && canAnimate && value > 0 ? 0 : value
  );
  const [deltaPulse, setDeltaPulse] = useState<{ amount: number; key: number } | null>(
    null
  );
  const prevValueRef = useRef<number>(
    animateOnMount && canAnimate && value > 0 ? 0 : value
  );
  const mountedRef = useRef(false);

  useEffect(() => {
    const startVal = mountedRef.current
      ? prevValueRef.current
      : animateOnMount && canAnimate && value > 0
      ? 0
      : value;

    const diff = value - prevValueRef.current;
    if (mountedRef.current && showDeltaBadge && diff > 0) {
      setDeltaPulse({ amount: diff, key: Date.now() });
      const hideTimer = window.setTimeout(() => setDeltaPulse(null), 1150);
      prevValueRef.current = value;
      if (!canAnimate || startVal === value) {
        setDisplayValue(value);
        return () => window.clearTimeout(hideTimer);
      }
      // Continue below with rAF while also cleaning up hideTimer
      let rafId = 0;
      const startTime = performance.now();
      const step = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayValue(Math.round(startVal + (value - startVal) * eased));
        if (t < 1) {
          rafId = window.requestAnimationFrame(step);
        }
      };
      rafId = window.requestAnimationFrame(step);
      return () => {
        window.cancelAnimationFrame(rafId);
        window.clearTimeout(hideTimer);
      };
    }

    mountedRef.current = true;
    prevValueRef.current = value;

    if (!canAnimate || startVal === value) {
      setDisplayValue(value);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(Math.round(startVal + (value - startVal) * eased));
      if (t < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };
    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [value, durationMs, animateOnMount, canAnimate, showDeltaBadge]);

  return (
    <span className={`relative inline-flex items-center tabular-nums ${className}`} style={style}>
      <motion.span
        key={deltaPulse ? `pulse-${deltaPulse.key}` : 'steady'}
        initial={deltaPulse && canAnimate ? { scale: 1 } : false}
        animate={deltaPulse && canAnimate ? { scale: [1, 1.16, 1] } : { scale: 1 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
      >
        {displayValue}
      </motion.span>
      {deltaPulse && (
        <motion.span
          key={`delta-${deltaPulse.key}`}
          initial={canAnimate ? { opacity: 0, y: 6, scale: 0.8 } : { opacity: 1 }}
          animate={canAnimate ? { opacity: [0, 1, 1, 0], y: -16, scale: 1 } : { opacity: 0 }}
          transition={{ duration: 1.05, ease: 'easeOut' }}
          className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-xs"
        >
          +{deltaPulse.amount}
        </motion.span>
      )}
    </span>
  );
};

interface AnswerFeedbackFlashProps {
  type: 'correct' | 'wrong' | null;
  effects: EffectiveVisualEffects;
}

/**
 * Light, brief, non-strobing visual flash inside the question stage.
 */
export const AnswerFeedbackFlash: React.FC<AnswerFeedbackFlashProps> = ({
  type,
  effects,
}) => {
  if (!type) return null;
  if (type === 'correct' && !effects.correct) return null;
  if (type === 'wrong' && !effects.wrong) return null;

  return (
    <motion.div
      key={`flash-${type}`}
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={
        effects.motion
          ? { opacity: type === 'correct' ? [0, 0.2, 0] : [0, 0.14, 0] }
          : { opacity: 0 }
      }
      transition={{ duration: type === 'correct' ? 0.38 : 0.32, ease: 'easeOut' }}
      className={`pointer-events-none absolute inset-0 z-20 ${
        type === 'correct' ? 'bg-emerald-500' : 'bg-rose-500'
      }`}
    />
  );
};

interface AnswerFeedbackBannerProps {
  type: 'correct' | 'wrong';
  headline?: string;
  detailText?: string;
  effectKey?: string;
  effects: EffectiveVisualEffects;
}

const MINI_SPARKLE_OFFSETS = [
  { x: -38, y: -18, delay: 0.02 },
  { x: 36, y: -16, delay: 0.05 },
  { x: -54, y: 6, delay: 0.08 },
  { x: 54, y: 8, delay: 0.04 },
  { x: -18, y: -24, delay: 0.07 },
  { x: 20, y: -22, delay: 0.03 },
];

/**
 * Animated Correct / Wrong judgment banner with SVG Checkmark or X-mark,
 * subtle emerald particles (on correct), and non-intrusive readable layout.
 */
export const AnswerFeedbackBanner: React.FC<AnswerFeedbackBannerProps> = ({
  type,
  headline,
  detailText,
  effectKey,
  effects,
}) => {
  const firedKeyRef = useRef<string | null>(null);
  const isCorrect = type === 'correct';
  const showRichEffect = isCorrect ? effects.correct : effects.wrong;

  useEffect(() => {
    if (!isCorrect || !effects.motion || !effects.correct) return;
    const key = effectKey || 'correct-once';
    if (firedKeyRef.current === key) return;
    firedKeyRef.current = key;
    triggerCorrectParticles();
  }, [isCorrect, effects.motion, effects.correct, effectKey]);

  const resolvedHeadline =
    headline || (isCorrect ? 'إجابة صحيحة!' : 'إجابة خاطئة');

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={
        effects.motion && showRichEffect
          ? { opacity: 0, scale: 0.88, y: 6 }
          : { opacity: 1, scale: 1, y: 0 }
      }
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={
        effects.motion && showRichEffect
          ? { type: 'spring', stiffness: 460, damping: 24, mass: 0.8 }
          : { duration: 0.14 }
      }
      className={`relative overflow-hidden rounded-2xl border-2 px-4 py-3.5 sm:px-5 sm:py-4 shadow-md ${
        isCorrect
          ? 'bg-emerald-600 border-emerald-400 text-white'
          : 'bg-rose-600 border-rose-400 text-white'
      }`}
    >
      {/* Subtle lightweight emerald burst dots on correct */}
      {isCorrect && effects.motion && effects.correct && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        >
          {MINI_SPARKLE_OFFSETS.map((dot, idx) => (
            <motion.span
              key={idx}
              initial={{ opacity: 0.9, x: 0, y: 0, scale: 0.5 }}
              animate={{ opacity: 0, x: dot.x, y: dot.y, scale: 1.15 }}
              transition={{ duration: 0.55, delay: dot.delay, ease: 'easeOut' }}
              className="absolute h-2 w-2 rounded-full bg-[#FDE68A]"
            />
          ))}
        </div>
      )}

      <div className="relative z-10 flex items-center justify-center gap-3 text-center sm:text-right">
        {/* Animated SVG Checkmark or X */}
        <motion.div
          initial={
            effects.motion && showRichEffect ? { scale: 0.5, rotate: -10 } : false
          }
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 20 }}
          className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full ${
            isCorrect ? 'bg-white text-emerald-700' : 'bg-white text-rose-600'
          } shadow-xs`}
        >
          {isCorrect ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6" fill="none">
              <motion.path
                d="M5 12.5L9.5 17L19 7.5"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={
                  effects.motion && effects.correct
                    ? { pathLength: 0 }
                    : { pathLength: 1 }
                }
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6" fill="none">
              <motion.path
                d="M7 7L17 17"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                initial={
                  effects.motion && effects.wrong
                    ? { pathLength: 0 }
                    : { pathLength: 1 }
                }
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              />
              <motion.path
                d="M17 7L7 17"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                initial={
                  effects.motion && effects.wrong
                    ? { pathLength: 0 }
                    : { pathLength: 1 }
                }
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.18, delay: 0.08, ease: 'easeOut' }}
              />
            </svg>
          )}
        </motion.div>

        <div className="min-w-0 space-y-0.5 text-right">
          <div className="font-display text-base sm:text-lg font-extrabold leading-tight">
            {resolvedHeadline}
          </div>
          {detailText && (
            <div className="text-xs sm:text-sm font-medium text-white/95 leading-snug">
              {detailText}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

interface MatchCelebrationHeaderProps<T extends MatchOutcomeTeamInput> {
  outcome: MatchOutcomeResult<T>;
  celebrationKey: string;
  subtitleMeta?: string;
  effects: EffectiveVisualEffects;
  forceReplayNonce?: number;
}

const FLOATING_SPARKLES = [
  { left: '12%', top: '16%', delay: 0 },
  { left: '84%', top: '18%', delay: 0.35 },
  { left: '22%', top: '68%', delay: 0.7 },
  { left: '78%', top: '64%', delay: 0.2 },
  { left: '50%', top: '12%', delay: 0.5 },
  { left: '8%', top: '42%', delay: 0.85 },
  { left: '92%', top: '40%', delay: 0.45 },
];

/**
 * Unified championship Winner / Tie / Zero-score celebration header + particles.
 * Respects reduced-motion, admin toggles, and strictly prevents duplicate replay
 * on component remount or reload via celebrationKey.
 */
export function MatchCelebrationHeader<T extends MatchOutcomeTeamInput>({
  outcome,
  celebrationKey,
  subtitleMeta,
  effects,
  forceReplayNonce = 0,
}: MatchCelebrationHeaderProps<T>) {
  const localClaimedRef = useRef<string | null>(null);

  useEffect(() => {
    if (outcome.isZeroScore) return;
    if (!effects.motion || !effects.winner) return;

    const fullKey = `${celebrationKey}_r${forceReplayNonce}`;
    if (localClaimedRef.current === fullKey) return;
    localClaimedRef.current = fullKey;

    // Allow manual replay in admin preview when forceReplayNonce > 0
    if (forceReplayNonce === 0 && !claimOneShotCelebrationKey(celebrationKey)) {
      return;
    }

    const cleanup = outcome.isTie
      ? triggerTieGoldenParticles()
      : triggerWinnerConfetti();

    return () => {
      cleanup();
    };
  }, [
    outcome.isZeroScore,
    outcome.isTie,
    celebrationKey,
    effects.motion,
    effects.winner,
    forceReplayNonce,
  ]);

  const showGoldBackdrop = !outcome.isZeroScore && effects.winner;

  return (
    <div className="relative overflow-hidden rounded-2xl px-3 py-4 sm:px-6 sm:py-6">
      {/* Celebratory Animated Golden Backdrop */}
      {showGoldBackdrop && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="absolute inset-0 opacity-70"
            style={{
              background: outcome.isTie
                ? 'radial-gradient(circle at 50% 24%, rgba(245, 183, 49, 0.22) 0%, rgba(240, 120, 66, 0.08) 45%, transparent 75%)'
                : 'radial-gradient(circle at 50% 22%, rgba(245, 183, 49, 0.26) 0%, rgba(20, 84, 61, 0.08) 48%, transparent 78%)',
            }}
          />
          {effects.motion &&
            FLOATING_SPARKLES.map((sp, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{
                  opacity: [0.2, 0.85, 0.2],
                  scale: [0.8, 1.25, 0.8],
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  delay: sp.delay,
                  ease: 'easeInOut',
                }}
                style={{ left: sp.left, top: sp.top }}
                className="absolute h-2 w-2 rounded-full bg-[#F5B731]"
              />
            ))}
        </div>
      )}

      <div className="relative z-10 space-y-4">
        {/* Animated Golden Trophy / Draw Crest */}
        <motion.div
          initial={
            effects.motion && effects.winner
              ? { scale: 0.6, opacity: 0, y: 10 }
              : { scale: 1, opacity: 1, y: 0 }
          }
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={
            effects.motion && effects.winner
              ? { type: 'spring', stiffness: 320, damping: 18 }
              : { duration: 0.16 }
          }
          className="relative mx-auto flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center"
        >
          {showGoldBackdrop && effects.motion && (
            <motion.div
              aria-hidden="true"
              animate={{ scale: [1, 1.14, 1], opacity: [0.45, 0.75, 0.45] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-3xl bg-amber-400/25 blur-md"
            />
          )}
          <div
            className={`relative flex h-18 w-18 sm:h-20 sm:w-20 items-center justify-center rounded-3xl border-2 shadow-lg ${
              outcome.isZeroScore
                ? 'bg-[#F3F5E9] border-[#E5E8DD] text-[#52574E]'
                : 'bg-gradient-to-br from-amber-100 via-amber-50 to-white border-amber-400 text-amber-600'
            }`}
          >
            {outcome.isTie ? (
              <Scale className="h-9 w-9 sm:h-10 sm:w-10 text-amber-600" />
            ) : outcome.isZeroScore ? (
              <Award className="h-9 w-9 sm:h-10 sm:w-10 text-[#52574E]" />
            ) : (
              <Trophy className="h-9 w-9 sm:h-11 sm:w-11 text-amber-500 drop-shadow-xs" />
            )}
          </div>
        </motion.div>

        {/* Match Ended Tag + Main Winner / Tie Headline */}
        <div className="space-y-2.5 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#14543D]/20 bg-[#EAF2EE] px-4 py-1 text-xs font-extrabold text-[#14543D]">
            {!outcome.isZeroScore && <Sparkles className="h-3.5 w-3.5 text-[#F07842]" />}
            <span>
              انتهت المباراة!
              {subtitleMeta ? ` · ${subtitleMeta}` : ''}
            </span>
          </div>

          {outcome.isZeroScore ? (
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#1B1F1C]">
              انتهت الجولة بدون نقاط مسجلة
            </h1>
          ) : outcome.isTie ? (
            <motion.div
              initial={
                effects.motion && effects.winner
                  ? { opacity: 0, scale: 0.92 }
                  : false
              }
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-2"
            >
              <div className="inline-block rounded-xl bg-amber-100 px-3.5 py-1 text-xs sm:text-sm font-extrabold text-amber-800 border border-amber-300">
                مواجهة متكافئة ومثيرة!
              </div>
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#1B1F1C]">
                تعادل!
              </h1>
              <p className="font-display text-base sm:text-lg font-bold text-[#14543D]">
                تقاسم{' '}
                {outcome.winners
                  .map((w, idx) => w.name?.trim() || `الفريق ${idx + 1}`)
                  .join(' و ')}{' '}
                الصدارة برصيد{' '}
                <AnimatedScoreCounter
                  value={outcome.topScore}
                  animateOnMount
                  motionEnabled={effects.motion && effects.winner}
                  className="font-mono text-[#F07842]"
                />{' '}
                نقطة!
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={
                effects.motion && effects.winner
                  ? { opacity: 0, scale: 0.9 }
                  : false
              }
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 280,
                damping: 20,
                delay: 0.06,
              }}
              className="space-y-2"
            >
              <div className="inline-block rounded-xl bg-amber-100 px-3.5 py-1 text-xs sm:text-sm font-extrabold text-amber-800 border border-amber-300">
                مبروك الفوز! 🏆
              </div>
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#1B1F1C] tracking-tight">
                {outcome.singleWinner?.name?.trim() || 'الفريق الفائز'}
              </h1>
              <p className="text-sm sm:text-base font-medium text-[#52574E]">
                حسموا صدارة النزال برصيد{' '}
                <AnimatedScoreCounter
                  value={outcome.topScore}
                  animateOnMount
                  motionEnabled={effects.motion && effects.winner}
                  className="font-mono text-lg sm:text-xl font-extrabold text-[#14543D]"
                />{' '}
                نقطة!
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
