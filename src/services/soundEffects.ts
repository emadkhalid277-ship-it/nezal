// Non-musical Web Audio API Sound Effects Library for NIZAL (نِزال)
// Synthesizes crisp UI, quiz buzzer, bell, stopwatch, and confetti-pop sounds with zero music and zero external file dependencies.

const SOUND_ENABLED_KEY = 'nizal_sfx_enabled_v1';

type SoundListener = (enabled: boolean) => void;

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private listeners: Set<SoundListener> = new Set();
  private lastVariationIndex: Record<string, number> = {};
  private isUnlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SOUND_ENABLED_KEY);
        if (saved !== null) {
          this.enabled = saved === 'true';
        }
      } catch {
        // ignore storage errors
      }

      // Unlock AudioContext on first user gesture (important for Android/iOS browsers)
      const unlockHandler = () => {
        this.unlock();
        if (this.isUnlocked) {
          window.removeEventListener('pointerdown', unlockHandler);
          window.removeEventListener('keydown', unlockHandler);
          window.removeEventListener('touchstart', unlockHandler);
        }
      };

      window.addEventListener('pointerdown', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
      window.addEventListener('touchstart', unlockHandler, { passive: true });
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      // Play silent 1-sample buffer to unlock iOS/Android WebKit audio
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      this.isUnlocked = true;
    } catch {
      // ignore
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(value: boolean): void {
    this.enabled = value;
    try {
      localStorage.setItem(SOUND_ENABLED_KEY, String(value));
    } catch {
      // ignore
    }
    this.listeners.forEach((cb) => cb(this.enabled));
    if (value) {
      this.unlock();
      this.playTileOpen();
    }
  }

  public toggle(): boolean {
    const next = !this.enabled;
    this.setEnabled(next);
    return next;
  }

  public subscribe(listener: SoundListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private pickVariation(key: string, count: number): number {
    const prev = this.lastVariationIndex[key];
    let idx = Math.floor(Math.random() * count);
    if (count > 1 && idx === prev) {
      idx = (idx + 1 + Math.floor(Math.random() * (count - 1))) % count;
    }
    this.lastVariationIndex[key] = idx;
    return idx;
  }

  // Helper: create filtered noise burst (useful for airy whooshes, pops, confetti bursts, clicks)
  private playNoiseBurst(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    gainPeak: number,
    q: number = 1.2
  ): void {
    const sampleRate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freqStart, startTime);
    if (freqEnd !== freqStart) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, freqEnd),
        startTime + duration
      );
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
    source.stop(startTime + duration + 0.01);
  }

  // Helper: clean percussive/bell tone (non-melodic single ping or buzzer)
  private playTone(
    ctx: AudioContext,
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    startTime: number,
    duration: number,
    gainPeak: number,
    lowpassHz?: number
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(30, freqEnd),
        startTime + duration
      );
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + Math.min(0.012, duration * 0.15));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    if (lowpassHz) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(lowpassHz, startTime);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /**
   * 1. أصوات متنوعة عند الإجابة الصحيحة (4 تنويعات بدون موسيقى)
   */
  public playCorrect(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const variant = this.pickVariation('correct', 4);

    if (variant === 0) {
      // Variant 1: Crisp Quiz Desk Bell ("دينغ!" رنّة جرس فوز صافية)
      this.playTone(ctx, 'sine', 1046, 1046, now, 0.42, 0.24);
      this.playTone(ctx, 'sine', 2092, 2092, now, 0.24, 0.08);
      this.playNoiseBurst(ctx, now, 0.025, 'highpass', 3000, 5000, 0.05);
    } else if (variant === 1) {
      // Variant 2: Double Crisp Bell Ding ("دينغ-دينغ!" نقرة فوز مزدوجة)
      this.playTone(ctx, 'sine', 988, 988, now, 0.16, 0.2);
      this.playTone(ctx, 'sine', 1976, 1976, now, 0.1, 0.06);
      this.playTone(ctx, 'sine', 1318, 1318, now + 0.09, 0.36, 0.24);
      this.playTone(ctx, 'sine', 2636, 2636, now + 0.09, 0.2, 0.07);
    } else if (variant === 2) {
      // Variant 3: Crisp Crystal Pop + Shimmer (فقاعة تأكيد صافية مع لمعة)
      this.playTone(ctx, 'sine', 620, 1280, now, 0.11, 0.22);
      this.playTone(ctx, 'sine', 1480, 1480, now + 0.07, 0.32, 0.2);
      this.playNoiseBurst(ctx, now + 0.05, 0.12, 'bandpass', 4200, 6500, 0.06, 2.0);
    } else {
      // Variant 4: Bright Woodblock / Ping Confirmation (طرقة خشبية + رنّة تأكيد)
      this.playTone(ctx, 'triangle', 740, 820, now, 0.07, 0.22);
      this.playTone(ctx, 'sine', 1175, 1175, now + 0.065, 0.35, 0.24);
      this.playTone(ctx, 'sine', 2350, 2350, now + 0.065, 0.18, 0.06);
    }
  }

  /**
   * 1.ب. أصوات فريدة ومميزة لكل فريق عند تسجيل نقطة في لوحة اللعبة (بدون موسيقى)
   */
  public playTeamScore(teamIndex: number): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const slot = ((Math.floor(teamIndex) % 4) + 4) % 4;

    if (slot === 0) {
      // Team 1: Crisp High Arena Desk Bell + Sparkle Ping (جرس فوز عالي وصافٍ)
      this.playNoiseBurst(ctx, now, 0.025, 'highpass', 3400, 5600, 0.06);
      this.playTone(ctx, 'sine', 1175, 1175, now, 0.36, 0.24);
      this.playTone(ctx, 'sine', 2350, 2350, now, 0.2, 0.07);
      this.playTone(ctx, 'sine', 1568, 1568, now + 0.075, 0.28, 0.16);
    } else if (slot === 1) {
      // Team 2: Energetic Double Woodblock & Bright Pop (نقرة خشبية مزدوجة سريعة)
      this.playTone(ctx, 'triangle', 540, 980, now, 0.08, 0.24);
      this.playNoiseBurst(ctx, now, 0.03, 'bandpass', 1800, 3200, 0.08, 1.8);
      this.playTone(ctx, 'sine', 1318, 1318, now + 0.075, 0.34, 0.24);
      this.playTone(ctx, 'sine', 2636, 2636, now + 0.075, 0.16, 0.06);
    } else if (slot === 2) {
      // Team 3: Warm Deep Resonant Chime + Crisp Snap (رنّة عميقة دافئة مع نقرة حادة)
      this.playNoiseBurst(ctx, now, 0.03, 'bandpass', 2400, 4200, 0.07, 1.5);
      this.playTone(ctx, 'sine', 659, 659, now, 0.38, 0.25);
      this.playTone(ctx, 'triangle', 988, 988, now + 0.085, 0.32, 0.16);
      this.playTone(ctx, 'sine', 1976, 1976, now + 0.085, 0.16, 0.05);
    } else {
      // Team 4: Rapid Triple Counter Click-Ping (نقرة عدّاد ثلاثية متسارعة)
      this.playNoiseBurst(ctx, now, 0.02, 'highpass', 2800, 4500, 0.08);
      this.playTone(ctx, 'sine', 880, 920, now, 0.09, 0.19);
      this.playNoiseBurst(ctx, now + 0.055, 0.02, 'highpass', 3000, 4800, 0.08);
      this.playTone(ctx, 'sine', 1109, 1140, now + 0.055, 0.1, 0.2);
      this.playTone(ctx, 'sine', 1480, 1480, now + 0.11, 0.34, 0.24);
      this.playTone(ctx, 'sine', 2960, 2960, now + 0.11, 0.16, 0.06);
    }
  }

  /**
   * 2. أصوات متنوعة عند الإجابة الخاطئة (4 تنويعات بدون موسيقى)
   */
  public playWrong(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const variant = this.pickVariation('wrong', 4);

    if (variant === 0) {
      // Variant 1: Classic Quiz Buzzer ("بَزّ!" جرس خطأ واضح)
      this.playTone(ctx, 'sawtooth', 160, 142, now, 0.28, 0.16, 480);
      this.playTone(ctx, 'triangle', 155, 135, now, 0.28, 0.14, 420);
    } else if (variant === 1) {
      // Variant 2: Double Short Error Buzz ("بَز-بَز!" تنبيه مزدوج سريع)
      this.playTone(ctx, 'sawtooth', 185, 170, now, 0.1, 0.15, 520);
      this.playTone(ctx, 'sawtooth', 150, 125, now + 0.13, 0.2, 0.16, 450);
    } else if (variant === 2) {
      // Variant 3: Damped Low Thud / Knock (صوت ارتطام خفيف هابط)
      this.playTone(ctx, 'sine', 210, 72, now, 0.22, 0.26);
      this.playNoiseBurst(ctx, now, 0.08, 'lowpass', 500, 180, 0.14);
    } else {
      // Variant 4: Mechanical Error Click-Buzz (نقرة رفض ميكانيكية)
      this.playTone(ctx, 'square', 140, 118, now, 0.18, 0.1, 380);
      this.playNoiseBurst(ctx, now, 0.05, 'bandpass', 600, 300, 0.1, 1.5);
    }
  }

  /**
   * 3. أصوات متنوعة عند بدء التحدي (3 تنويعات حماسية بدون موسيقى)
   */
  public playChallengeStart(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const variant = this.pickVariation('start', 3);

    if (variant === 0) {
      // Variant 1: Arena Start Bell Double-Strike + Air Whoosh (جرس انطلاق النزال + هبّة هواء)
      this.playNoiseBurst(ctx, now, 0.24, 'bandpass', 300, 2200, 0.14, 1.0);
      this.playTone(ctx, 'sine', 880, 880, now + 0.05, 0.22, 0.22);
      this.playTone(ctx, 'sine', 1760, 1760, now + 0.05, 0.14, 0.07);
      this.playTone(ctx, 'sine', 1175, 1175, now + 0.18, 0.45, 0.25);
      this.playTone(ctx, 'sine', 2350, 2350, now + 0.18, 0.25, 0.08);
    } else if (variant === 1) {
      // Variant 2: Crisp Duel Gong Impact (قرع جرس الحلبة الواضح)
      this.playTone(ctx, 'sine', 220, 110, now, 0.18, 0.22);
      this.playNoiseBurst(ctx, now, 0.18, 'lowpass', 1800, 450, 0.12);
      this.playTone(ctx, 'sine', 1046, 1046, now + 0.04, 0.55, 0.24);
      this.playTone(ctx, 'triangle', 1568, 1568, now + 0.04, 0.35, 0.08);
    } else {
      // Variant 3: Stopwatch Rapid Ready-Set-Go Ticks + Bell (تكتكة انطلاق + جرس البداية)
      this.playNoiseBurst(ctx, now, 0.025, 'highpass', 2200, 3500, 0.12);
      this.playNoiseBurst(ctx, now + 0.12, 0.025, 'highpass', 2600, 4000, 0.14);
      this.playTone(ctx, 'sine', 1318, 1318, now + 0.24, 0.46, 0.24);
      this.playTone(ctx, 'sine', 2636, 2636, now + 0.24, 0.22, 0.07);
    }
  }

  /**
   * 4. صوت نقرة فتح خانة سؤال من اللوحة
   */
  public playTileOpen(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playTone(ctx, 'sine', 420, 760, now, 0.075, 0.16);
    this.playNoiseBurst(ctx, now, 0.03, 'bandpass', 1800, 3000, 0.05);
  }

  /**
   * 5. صوت كشف الإجابة الصحيحة (تقليب بطاقة ناعم)
   */
  public playAnswerReveal(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playNoiseBurst(ctx, now, 0.11, 'bandpass', 1000, 3200, 0.1, 1.4);
    this.playTone(ctx, 'sine', 660, 880, now + 0.03, 0.12, 0.12);
  }

  /**
   * 6. تكتكة ساعة لطيفة لآخر 5 ثوانٍ من المؤقت
   */
  public playTimerTick(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playNoiseBurst(ctx, now, 0.02, 'bandpass', 3200, 4500, 0.09, 2.5);
    this.playTone(ctx, 'triangle', 900, 650, now, 0.03, 0.08);
  }

  /**
   * 7. جرس انتهاء الوقت
   */
  public playTimeUp(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Mechanical timer double-ring
    this.playTone(ctx, 'triangle', 840, 840, now, 0.14, 0.2);
    this.playTone(ctx, 'triangle', 840, 840, now + 0.16, 0.28, 0.22);
    this.playNoiseBurst(ctx, now, 0.04, 'highpass', 2500, 4000, 0.06);
  }

  /**
   * 8. جرس رفع اليد / الاستعداد للإجابة في اللعب الجماعي أونلاين
   */
  public playBuzzIn(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playTone(ctx, 'sine', 784, 1046, now, 0.14, 0.2);
    this.playTone(ctx, 'sine', 1568, 1568, now + 0.04, 0.18, 0.08);
  }

  /**
   * 9. صوت انتهاء الجولة والفوز (فرقعة قصاصات ورقية + جرس احتفال بدون موسيقى)
   */
  public playMatchWin(): void {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Confetti popper burst
    this.playTone(ctx, 'sine', 240, 80, now, 0.1, 0.22);
    this.playNoiseBurst(ctx, now + 0.02, 0.22, 'bandpass', 1800, 5200, 0.16, 0.9);
    // Double victory desk bell
    this.playTone(ctx, 'sine', 1046, 1046, now + 0.1, 0.22, 0.2);
    this.playTone(ctx, 'sine', 1396, 1396, now + 0.24, 0.55, 0.25);
    this.playTone(ctx, 'sine', 2792, 2792, now + 0.24, 0.28, 0.08);
  }
}

export const soundFX = new SoundEffectsManager();
