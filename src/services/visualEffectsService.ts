import confetti from 'canvas-confetti';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { VisualEffectsSettings } from '../types/game';
import {
  isFirestoreQuotaExceededError,
  isFirestoreQuotaPaused,
  trackFirestoreOp,
  triggerFirestoreQuotaCooldown,
} from '../utils/firestoreDiagnostics';

const SETTINGS_COLLECTION = 'settings';
const VISUAL_EFFECTS_DOC_ID = 'visual_effects';
const VISUAL_EFFECTS_STORAGE_KEY = 'nizal_visual_effects_settings_v1';
let memoryCachedSettings: VisualEffectsSettings | null = null;

export const DEFAULT_VISUAL_EFFECTS_SETTINGS: VisualEffectsSettings = {
  id: VISUAL_EFFECTS_DOC_ID,
  motionEffectsEnabled: true,
  correctAnswerEffect: true,
  wrongAnswerEffect: true,
  winnerCelebrationEffect: true,
};

export interface EffectiveVisualEffects {
  motion: boolean;
  correct: boolean;
  wrong: boolean;
  winner: boolean;
}

export function resolveEffectiveVisualEffects(
  settings: VisualEffectsSettings | undefined | null,
  prefersReducedMotion: boolean
): EffectiveVisualEffects {
  const safe = settings ?? DEFAULT_VISUAL_EFFECTS_SETTINGS;
  const masterMotion = safe.motionEffectsEnabled && !prefersReducedMotion;
  return {
    motion: masterMotion,
    correct: Boolean(safe.correctAnswerEffect),
    wrong: Boolean(safe.wrongAnswerEffect),
    winner: Boolean(safe.winnerCelebrationEffect),
  };
}

function normalizeSettings(raw: Partial<VisualEffectsSettings>): VisualEffectsSettings {
  return {
    id: VISUAL_EFFECTS_DOC_ID,
    motionEffectsEnabled:
      typeof raw.motionEffectsEnabled === 'boolean'
        ? raw.motionEffectsEnabled
        : true,
    correctAnswerEffect:
      typeof raw.correctAnswerEffect === 'boolean'
        ? raw.correctAnswerEffect
        : true,
    wrongAnswerEffect:
      typeof raw.wrongAnswerEffect === 'boolean'
        ? raw.wrongAnswerEffect
        : true,
    winnerCelebrationEffect:
      typeof raw.winnerCelebrationEffect === 'boolean'
        ? raw.winnerCelebrationEffect
        : true,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

export function loadCachedVisualEffectsSettings(): VisualEffectsSettings {
  if (typeof window === 'undefined') return DEFAULT_VISUAL_EFFECTS_SETTINGS;
  try {
    const raw = window.localStorage.getItem(VISUAL_EFFECTS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISUAL_EFFECTS_SETTINGS;
    return normalizeSettings(JSON.parse(raw) as Partial<VisualEffectsSettings>);
  } catch {
    return DEFAULT_VISUAL_EFFECTS_SETTINGS;
  }
}

function persistLocalVisualEffectsSettings(settings: VisualEffectsSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      VISUAL_EFFECTS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchVisualEffectsSettingsFromFirestore(
  forceRefresh = false
): Promise<VisualEffectsSettings> {
  if (!forceRefresh && memoryCachedSettings) {
    return memoryCachedSettings;
  }

  const localFallback = loadCachedVisualEffectsSettings();
  if (isFirestoreQuotaPaused()) {
    trackFirestoreOp('questions_bootstrap', 'dedup_skip', 1, 'quota_paused_visual_effects');
    memoryCachedSettings = localFallback;
    return localFallback;
  }

  try {
    trackFirestoreOp('questions_bootstrap', 'read', 1, 'settings/visual_effects');
    const docRef = doc(db, SETTINGS_COLLECTION, VISUAL_EFFECTS_DOC_ID);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      memoryCachedSettings = localFallback;
      return localFallback;
    }
    const data = snap.data() as Record<string, unknown>;
    const normalized = normalizeSettings({
      motionEffectsEnabled:
        typeof data.motionEffectsEnabled === 'boolean'
          ? data.motionEffectsEnabled
          : true,
      correctAnswerEffect:
        typeof data.correctAnswerEffect === 'boolean'
          ? data.correctAnswerEffect
          : true,
      wrongAnswerEffect:
        typeof data.wrongAnswerEffect === 'boolean'
          ? data.wrongAnswerEffect
          : true,
      winnerCelebrationEffect:
        typeof data.winnerCelebrationEffect === 'boolean'
          ? data.winnerCelebrationEffect
          : true,
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
    });
    persistLocalVisualEffectsSettings(normalized);
    memoryCachedSettings = normalized;
    return normalized;
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      triggerFirestoreQuotaCooldown('questions_bootstrap', err);
    }
    memoryCachedSettings = localFallback;
    return localFallback;
  }
}

export async function saveVisualEffectsSettingsToFirestore(
  payload: Pick<
    VisualEffectsSettings,
    | 'motionEffectsEnabled'
    | 'correctAnswerEffect'
    | 'wrongAnswerEffect'
    | 'winnerCelebrationEffect'
  >,
  adminUid: string
): Promise<VisualEffectsSettings> {
  const localNormalized = normalizeSettings({
    ...payload,
    updatedBy: adminUid.slice(0, 128),
    updatedAt: new Date().toISOString(),
  });
  persistLocalVisualEffectsSettings(localNormalized);
  memoryCachedSettings = localNormalized;

  const docRef = doc(db, SETTINGS_COLLECTION, VISUAL_EFFECTS_DOC_ID);
  const docData = {
    id: VISUAL_EFFECTS_DOC_ID,
    motionEffectsEnabled: localNormalized.motionEffectsEnabled,
    correctAnswerEffect: localNormalized.correctAnswerEffect,
    wrongAnswerEffect: localNormalized.wrongAnswerEffect,
    winnerCelebrationEffect: localNormalized.winnerCelebrationEffect,
    updatedBy: adminUid.slice(0, 128),
    updatedAt: serverTimestamp(),
  };
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    await updateDoc(docRef, docData);
  } else {
    await setDoc(docRef, docData);
  }

  return localNormalized;
}

export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Subtle green + gold particle burst on correct answer.
 * Lightweight on mobile viewports & automatically skipped under reduced motion.
 */
export function triggerCorrectParticles(): void {
  if (typeof window === 'undefined' || isReducedMotionPreferred()) return;
  try {
    const isMobile = window.innerWidth < 640;
    void confetti({
      particleCount: isMobile ? 20 : 32,
      spread: isMobile ? 52 : 64,
      startVelocity: isMobile ? 24 : 30,
      ticks: 68,
      gravity: 1.05,
      scalar: isMobile ? 0.78 : 0.9,
      origin: { x: 0.5, y: 0.58 },
      colors: ['#14543D', '#10B981', '#34D399', '#F5B731'],
      disableForReducedMotion: true,
      zIndex: 110,
    });
  } catch {
    // Ignore canvas errors in unsupported environments
  }
}

/**
 * Championship confetti + golden particles when a winner is declared.
 * Returns a cleanup callback to cancel delayed secondary bursts on unmount.
 */
export function triggerWinnerConfetti(): () => void {
  if (typeof window === 'undefined' || isReducedMotionPreferred()) {
    return () => {};
  }

  const timeouts: number[] = [];
  const isMobile = window.innerWidth < 640;

  try {
    void confetti({
      particleCount: isMobile ? 36 : 56,
      spread: isMobile ? 68 : 82,
      startVelocity: isMobile ? 32 : 38,
      ticks: 115,
      gravity: 0.92,
      scalar: isMobile ? 0.85 : 1,
      origin: { x: 0.5, y: 0.36 },
      colors: ['#F5B731', '#FBBF24', '#14543D', '#F07842', '#FFFFFF'],
      disableForReducedMotion: true,
      zIndex: 110,
    });

    const t1 = window.setTimeout(() => {
      try {
        void confetti({
          particleCount: isMobile ? 16 : 24,
          angle: 60,
          spread: 52,
          startVelocity: 30,
          ticks: 95,
          origin: { x: 0.14, y: 0.52 },
          colors: ['#F5B731', '#FDE68A', '#14543D'],
          disableForReducedMotion: true,
          zIndex: 110,
        });
        void confetti({
          particleCount: isMobile ? 16 : 24,
          angle: 120,
          spread: 52,
          startVelocity: 30,
          ticks: 95,
          origin: { x: 0.86, y: 0.52 },
          colors: ['#F5B731', '#FDE68A', '#F07842'],
          disableForReducedMotion: true,
          zIndex: 110,
        });
      } catch {
        // ignore
      }
    }, 240);

    timeouts.push(t1);
  } catch {
    // ignore
  }

  return () => {
    timeouts.forEach((id) => window.clearTimeout(id));
  };
}

/**
 * Balanced golden particles for honorable Tie / Draw match finishes.
 */
export function triggerTieGoldenParticles(): () => void {
  if (typeof window === 'undefined' || isReducedMotionPreferred()) {
    return () => {};
  }

  const timeouts: number[] = [];
  const isMobile = window.innerWidth < 640;

  try {
    void confetti({
      particleCount: isMobile ? 24 : 38,
      spread: 76,
      startVelocity: 26,
      ticks: 100,
      gravity: 0.85,
      scalar: isMobile ? 0.82 : 0.94,
      origin: { x: 0.5, y: 0.35 },
      colors: ['#F5B731', '#FBBF24', '#FDE68A', '#F07842'],
      disableForReducedMotion: true,
      zIndex: 110,
    });

    const t1 = window.setTimeout(() => {
      try {
        void confetti({
          particleCount: isMobile ? 14 : 20,
          spread: 60,
          startVelocity: 20,
          ticks: 88,
          origin: { x: 0.5, y: 0.28 },
          colors: ['#F5B731', '#FDE68A', '#FBBF24'],
          disableForReducedMotion: true,
          zIndex: 110,
        });
      } catch {
        // ignore
      }
    }, 260);

    timeouts.push(t1);
  } catch {
    // ignore
  }

  return () => {
    timeouts.forEach((id) => window.clearTimeout(id));
  };
}

/**
 * Ensures a celebration animation key only fires once per session for a given finished match.
 */
export function claimOneShotCelebrationKey(key: string): boolean {
  if (!key || typeof window === 'undefined') return true;
  const storageKey = `nizal_celebrated_${key}`;
  try {
    if (window.sessionStorage.getItem(storageKey) === '1') {
      return false;
    }
    window.sessionStorage.setItem(storageKey, '1');
    return true;
  } catch {
    return true;
  }
}
