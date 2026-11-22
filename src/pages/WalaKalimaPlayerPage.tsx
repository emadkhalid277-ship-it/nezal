import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  EyeOff,
  Flag,
  Hand,
  Lock,
  MicOff,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { WalaKalimaPlayerSessionState } from '../types/walaKalima';
import {
  claimWalaKalimaQrRound,
  playerActionWalaKalimaRound,
} from '../services/walaKalimaService';
import { soundFX } from '../services/soundEffects';
import { CircularCountdownTimer } from '../components/CircularCountdownTimer';

interface WalaKalimaPlayerPageProps {
  sessionId: string;
  qrToken: string;
  onExitToHome?: () => void;
}

export const WalaKalimaPlayerPage: React.FC<WalaKalimaPlayerPageProps> = ({
  sessionId,
  qrToken,
  onExitToHome,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<'correct' | 'skip' | 'finish' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<WalaKalimaPlayerSessionState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const claimAttemptedRef = useRef(false);
  const storageKey = `nizal_wk_player_${sessionId}`;

  const persistPlayerToken = useCallback(
    (token: string) => {
      if (!token) return;
      try {
        sessionStorage.setItem(storageKey, token);
      } catch {
        // ignore private browsing errors
      }
    },
    [storageKey]
  );

  const readSavedPlayerToken = useCallback((): string | undefined => {
    try {
      return sessionStorage.getItem(storageKey) || undefined;
    } catch {
      return undefined;
    }
  }, [storageKey]);

  const clearSavedPlayerToken = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  // Claim QR session strictly once on mount
  useEffect(() => {
    if (claimAttemptedRef.current) return;
    claimAttemptedRef.current = true;

    let cancelled = false;
    const savedToken = readSavedPlayerToken();

    setLoading(true);
    claimWalaKalimaQrRound({
      sessionId,
      qrToken,
      playerToken: savedToken,
    })
      .then((res) => {
        if (cancelled) return;
        persistPlayerToken(res.playerToken);
        setSessionState(res);
        setSecondsLeft(res.remainingSeconds);
        setErrorMsg(null);
        // Strip sensitive wkToken from address bar once claimed
        try {
          const cleanUrl = new URL(window.location.href);
          if (cleanUrl.searchParams.has('wkToken')) {
            cleanUrl.searchParams.delete('wkToken');
            window.history.replaceState({}, '', cleanUrl.toString());
          }
        } catch {
          // ignore
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'تعذّر فتح جولة ولا كلمة. قد يكون الرمز منتهي الصلاحية أو مستخدماً.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, qrToken, persistPlayerToken, readSavedPlayerToken]);

  // Smooth countdown timer + server deadline sync while active
  useEffect(() => {
    if (!sessionState || sessionState.status !== 'active' || !sessionState.expiresAt) {
      return;
    }

    const updateTimer = () => {
      const rem = Math.max(0, Math.ceil(((sessionState.expiresAt || 0) - Date.now()) / 1000));
      setSecondsLeft(rem);
    };
    updateTimer();

    const clockInterval = window.setInterval(updateTimer, 300);
    const syncInterval = window.setInterval(() => {
      if (!sessionState.playerToken) return;
      void playerActionWalaKalimaRound({
        sessionId: sessionState.sessionId,
        playerToken: sessionState.playerToken,
        action: 'sync',
      })
        .then((nextState) => {
          setSessionState((prev) =>
            nextState.playerToken
              ? nextState
              : { ...nextState, playerToken: prev?.playerToken || '' }
          );
          if (nextState.status === 'finished' || nextState.status === 'expired') {
            clearSavedPlayerToken();
            if (nextState.earnedPoints > 0) {
              soundFX.playCorrect();
            } else {
              soundFX.playTimeUp();
            }
          }
        })
        .catch(() => {
          // ignore transient sync issues
        });
    }, 1200);

    return () => {
      window.clearInterval(clockInterval);
      window.clearInterval(syncInterval);
    };
  }, [
    sessionState?.status,
    sessionState?.expiresAt,
    sessionState?.sessionId,
    sessionState?.playerToken,
    clearSavedPlayerToken,
  ]);

  const handleAction = async (action: 'correct' | 'skip' | 'finish') => {
    if (!sessionState || !sessionState.playerToken || busyAction) return;
    if (sessionState.status !== 'active') return;

    setBusyAction(action);
    setActionHint(null);
    try {
      const nextState = await playerActionWalaKalimaRound({
        sessionId: sessionState.sessionId,
        playerToken: sessionState.playerToken,
        action,
      });

      if (action === 'correct') soundFX.playCorrect();
      else if (action === 'skip') soundFX.playTileOpen();
      else soundFX.playTimeUp();

      setSessionState(nextState);
      setSecondsLeft(nextState.remainingSeconds);

      if (nextState.status !== 'active') {
        clearSavedPlayerToken();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'انتهى الوقت أو تم إغلاق الجولة.';
      if (action === 'skip' && msg.includes('التخطي')) {
        setActionHint(msg);
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <div
        dir="rtl"
        className="min-h-[100dvh] bg-[#F3F5E9] flex flex-col items-center justify-center p-5 text-center space-y-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-[#14543D] text-white flex items-center justify-center">
          <Lock className="w-7 h-7 text-[#F07842]" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-lg font-bold text-[#252824]">
            جاري تجهيز الكلمة السرية للتمثيل الصامت...
          </h1>
          <p className="text-xs text-[#777B73]">تأكد أن شاشة جوالك موجهة لك فقط</p>
        </div>
      </div>
    );
  }

  if (errorMsg || !sessionState) {
    return (
      <div
        dir="rtl"
        className="min-h-[100dvh] bg-[#F3F5E9] flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full bg-white border-2 border-rose-200 rounded-3xl p-6 text-center space-y-5 shadow-md">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-[#252824]">
              لا يمكن فتح هذه الجولة
            </h1>
            <p className="text-sm text-[#52574E] leading-relaxed">
              {errorMsg || 'انتهت صلاحية الرمز أو تم مسحه من جهاز آخر.'}
            </p>
          </div>
          {onExitToHome && (
            <button
              type="button"
              onClick={onExitToHome}
              className="w-full min-h-[48px] rounded-2xl bg-[#14543D] text-white font-bold text-sm cursor-pointer"
            >
              العودة إلى الرئيسية
            </button>
          )}
        </div>
      </div>
    );
  }

  // FINISHED / EXPIRED ROUND VIEW ON PHONE
  if (sessionState.status !== 'active') {
    const wonRound = sessionState.earnedPoints > 0;
    return (
      <div
        dir="rtl"
        className="min-h-[100dvh] bg-[#F3F5E9] flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full bg-white border-2 border-[#14543D] rounded-3xl p-6 text-center space-y-5 shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-[#14543D] text-white flex items-center justify-center mx-auto">
            {wonRound ? (
              <Trophy className="w-7 h-7 text-[#FDE68A]" />
            ) : sessionState.endReason === 'time_up' ? (
              <Clock className="w-7 h-7 text-[#F07842]" />
            ) : (
              <Sparkles className="w-7 h-7 text-[#F07842]" />
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#D9602B]">
              {sessionState.teamName} · {sessionState.contentTypeLabel}
            </div>
            <h1 className="font-display text-2xl font-bold text-[#252824]">
              {wonRound
                ? 'كفو! خمن فريقك الكلمة بنجاح'
                : sessionState.endReason === 'time_up'
                ? 'انتهى وقت التمثيل الصامت!'
                : 'تم إنهاء الجولة'}
            </h1>
            <p className="text-xs text-[#777B73] leading-relaxed">
              {wonRound
                ? 'أصبحت شاشة المباراة جاهزة الآن لاعتماد النقاط لفريقك.'
                : 'انتهت الجولة بـ 0 نقطة وأصبحت شاشة المباراة جاهزة للانتقال للدور التالي.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl bg-[#EAF2EE] border border-[#14543D]/15 p-3">
              <div className="text-[11px] font-bold text-[#14543D]">التخمين</div>
              <div className="font-sans text-sm font-bold text-[#14543D] mt-1">
                {wonRound ? 'صحيح' : 'لم يُخمن'}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] p-3">
              <div className="text-[11px] font-bold text-[#777B73]">التخطي</div>
              <div className="font-mono text-2xl font-bold text-[#52574E] tabular-nums mt-0.5">
                {sessionState.skippedCount}
              </div>
            </div>
            <div className="rounded-2xl bg-[#FEF2EC] border border-[#F07842]/30 p-3">
              <div className="text-[11px] font-bold text-[#D9602B]">النقاط</div>
              <div className="font-mono text-2xl font-bold text-[#F07842] tabular-nums mt-0.5">
                {wonRound ? `+${sessionState.earnedPoints}` : '0'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeWord = sessionState.activeWord;
  const remainingSkips = sessionState.remainingSkips ?? 0;
  const canSkip = remainingSkips > 0;

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] bg-[#F3F5E9] flex flex-col max-w-lg mx-auto"
    >
      {/* Compact Top Bar (<= 56px) */}
      <header className="sticky top-0 z-20 bg-[#FFFFFF]/95 backdrop-blur border-b border-[#E5E8DD] px-4 h-14 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-1.5 text-xs font-bold text-[#14543D]">
          <Lock className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
          <span className="truncate">{sessionState.teamName}</span>
          <span className="text-[#777B73]">·</span>
          <span className="text-[#52574E] truncate">{sessionState.contentTypeLabel}</span>
        </div>

        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() => handleAction('finish')}
          aria-label="إنهاء الجولة بدون نقاط"
          className="min-h-[40px] px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Flag className="w-3.5 h-3.5" />
          <span>إنهاء (0)</span>
        </button>
      </header>

      {/* Main Content: Circular Timer + Secret Word + Charades Rules */}
      <main className="flex-1 px-4 py-4 flex flex-col justify-between gap-4">
        {/* Timer & Round Meta Strip */}
        <div className="bg-white border border-[#E5E8DD] rounded-3xl p-4 flex items-center justify-between gap-4 shadow-xs">
          <CircularCountdownTimer
            totalSeconds={sessionState.timerSeconds}
            remainingSeconds={secondsLeft}
            expiresAt={sessionState.expiresAt}
            isActive={sessionState.status === 'active'}
            size={96}
            strokeWidth={8}
            variant="light"
          />

          <div className="flex-1 space-y-2 text-right">
            <div className="text-xs font-bold text-[#14543D]">
              التمثيل الصامت جارٍ الآن
            </div>
            <div className="flex items-center justify-between text-xs border-b border-[#F3F5E9] pb-1.5">
              <span className="text-[#777B73] font-semibold">جائزة التخمين</span>
              <span className="font-mono font-bold text-[#F07842] tabular-nums">
                +{sessionState.pointsPerCorrectWord} نقطة
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#777B73] font-semibold">التخطي المتبقي</span>
              <span className="font-mono font-bold text-[#14543D] tabular-nums">
                {remainingSkips} / {sessionState.maxSkips}
              </span>
            </div>
          </div>
        </div>

        {/* Secret Word Hero Card (ONLY visible on acting player's phone) */}
        {activeWord && (
          <div className="bg-gradient-to-br from-[#14543D] to-[#0E3D2C] border-2 border-[#14543D] rounded-3xl p-5 sm:p-7 text-center text-white shadow-lg space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-[#EAF2EE]/85">
              <span>الكلمة السرية على جوالك فقط</span>
              <span className="font-sans text-[#FDBA74]">{activeWord.difficulty}</span>
            </div>

            <div className="py-4 sm:py-6">
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words text-balance">
                {activeWord.word}
              </h1>
            </div>

            <p className="text-xs font-semibold text-[#EAF2EE]/90">
              مثّلها لفريقك بالحركات والإشارات وتعبيرات الوجه فقط!
            </p>
          </div>
        )}

        {/* Strict Charades Rules Card */}
        <section
          aria-label="قواعد التمثيل الصامت"
          className="bg-white border border-[#E5E8DD] rounded-2xl p-4 space-y-2.5"
        >
          <div className="text-xs font-bold text-[#252824]">قواعد التمثيل الصامت:</div>
          <ul className="space-y-2 text-xs text-[#52574E] font-semibold">
            <li className="flex items-center gap-2">
              <Hand className="w-4 h-4 text-[#14543D] shrink-0" />
              <span>الإيماءات وحركات اليد والجسم وتعبيرات الوجه فقط.</span>
            </li>
            <li className="flex items-center gap-2">
              <MicOff className="w-4 h-4 text-rose-600 shrink-0" />
              <span>ممنوع الكلام أو الهمس أو إصدار أي أصوات أو نطق حروف الكلمة.</span>
            </li>
            <li className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-[#D9602B] shrink-0" />
              <span>ممنوع الكتابة أو إظهار شاشة الهاتف لبقية الفريق.</span>
            </li>
          </ul>
        </section>

        {actionHint && (
          <div
            role="status"
            className="p-3 rounded-xl bg-[#FFF7ED] border border-[#F07842]/40 text-xs font-bold text-[#D9602B] text-center"
          >
            {actionHint}
          </div>
        )}
      </main>

      {/* Thumb-Zone Bottom Action Controls (56px high touch targets) */}
      <footer className="bg-[#FFFFFF] border-t border-[#E5E8DD] p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleAction('correct')}
            className="min-h-[56px] px-3 rounded-2xl bg-[#14543D] hover:bg-[#0E3D2C] active:scale-[0.98] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-60 whitespace-nowrap"
          >
            <CheckCircle2 className="w-5 h-5 text-[#86EFAC] shrink-0" />
            <span>
              {busyAction === 'correct'
                ? 'جاري الاعتماد...'
                : `تخمين صحيح (+${sessionState.pointsPerCorrectWord})`}
            </span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null || !canSkip}
            onClick={() => handleAction('skip')}
            className="min-h-[56px] px-3 rounded-2xl bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.98] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <SkipForward className="w-5 h-5 shrink-0" />
            <span>
              {busyAction === 'skip'
                ? 'جاري التبديل...'
                : canSkip
                ? `تخطي (${remainingSkips})`
                : 'انتهى التخطي'}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
};
