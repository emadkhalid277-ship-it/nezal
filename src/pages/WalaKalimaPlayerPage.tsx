import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Flag,
  Lock,
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

    const clockInterval = window.setInterval(updateTimer, 350);
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
            soundFX.playTimeUp();
          }
        })
        .catch(() => {
          // ignore transient sync issues
        });
    }, 1500);

    return () => {
      window.clearInterval(clockInterval);
      window.clearInterval(syncInterval);
    };
  }, [sessionState?.status, sessionState?.expiresAt, sessionState?.sessionId, sessionState?.playerToken, clearSavedPlayerToken]);

  const handleAction = async (action: 'correct' | 'skip' | 'finish') => {
    if (!sessionState || !sessionState.playerToken || busyAction) return;
    if (sessionState.status !== 'active') return;

    setBusyAction(action);
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
      setErrorMsg(err instanceof Error ? err.message : 'انتهى الوقت أو تم إغلاق الجولة.');
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
        <div className="w-14 h-14 rounded-2xl bg-[#14543D] text-white flex items-center justify-center animate-pulse">
          <Lock className="w-7 h-7 text-[#F07842]" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-lg font-bold text-[#252824]">
            جاري تجهيز بطاقة اللاعب السرية...
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
    return (
      <div
        dir="rtl"
        className="min-h-[100dvh] bg-[#F3F5E9] flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full bg-white border-2 border-[#14543D] rounded-3xl p-6 text-center space-y-5 shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-[#14543D] text-white flex items-center justify-center mx-auto">
            {sessionState.earnedPoints > 0 ? (
              <Trophy className="w-7 h-7 text-[#FDE68A]" />
            ) : (
              <Sparkles className="w-7 h-7 text-[#F07842]" />
            )}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-bold text-[#D9602B]">
              {sessionState.teamName} · {sessionState.contentTypeLabel}
            </div>
            <h1 className="font-display text-2xl font-bold text-[#252824]">
              {sessionState.endReason === 'completed_all'
                ? 'أحسنت! أتممت جميع كلمات الجولة'
                : sessionState.endReason === 'time_up'
                ? 'انتهى وقت الجولة!'
                : 'تم إنهاء الجولة'}
            </h1>
            <p className="text-xs text-[#777B73]">
              أصبحت شاشة المباراة جاهزة الآن لاعتماد النتيجة، وانتهت صلاحية هذا الرمز.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl bg-[#EAF2EE] border border-[#14543D]/15 p-3">
              <div className="text-[11px] font-bold text-[#14543D]">صحيحة</div>
              <div className="font-mono text-2xl font-bold text-[#14543D] tabular-nums mt-0.5">
                {sessionState.correctCount}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] p-3">
              <div className="text-[11px] font-bold text-[#777B73]">تخطي</div>
              <div className="font-mono text-2xl font-bold text-[#52574E] tabular-nums mt-0.5">
                {sessionState.skippedCount}
              </div>
            </div>
            <div className="rounded-2xl bg-[#FEF2EC] border border-[#F07842]/30 p-3">
              <div className="text-[11px] font-bold text-[#D9602B]">النقاط</div>
              <div className="font-mono text-2xl font-bold text-[#F07842] tabular-nums mt-0.5">
                +{sessionState.earnedPoints}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeWord = sessionState.activeWord;

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] bg-[#F3F5E9] flex flex-col max-w-lg mx-auto"
    >
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-20 bg-[#FFFFFF]/95 backdrop-blur border-b border-[#E5E8DD] px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#14543D]">
            <Lock className="w-3.5 h-3.5 text-[#F07842] shrink-0" />
            <span className="truncate">{sessionState.teamName}</span>
            <span>·</span>
            <span className="text-[#777B73] truncate">{sessionState.contentTypeLabel}</span>
          </div>
          <div className="text-xs font-bold text-[#252824] tabular-nums">
            الكلمة {Math.min(sessionState.currentIndex + 1, sessionState.totalWords)} من{' '}
            {sessionState.totalWords}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`px-3 py-1.5 rounded-xl font-mono text-base font-bold tabular-nums flex items-center gap-1.5 border ${
              secondsLeft <= 10
                ? 'bg-[#F07842] border-[#F07842] text-white animate-pulse'
                : 'bg-[#EAF2EE] border-[#14543D]/20 text-[#14543D]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{secondsLeft}</span>
          </div>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleAction('finish')}
            title="إنهاء الجولة"
            aria-label="إنهاء الجولة"
            className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5" />
            <span>إنهاء</span>
          </button>
        </div>
      </header>

      {/* Main Content Area: Secret Word + Forbidden Words */}
      <main className="flex-1 px-4 py-4 flex flex-col justify-between gap-4">
        {/* Live Score Strip */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-white border border-[#E5E8DD] rounded-2xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-xs font-bold text-[#777B73]">الإجابات الصحيحة</span>
            <span className="font-mono text-lg font-bold text-[#14543D] tabular-nums">
              {sessionState.correctCount}
            </span>
          </div>
          <div className="bg-white border border-[#E5E8DD] rounded-2xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-xs font-bold text-[#777B73]">نقاط الجولة</span>
            <span className="font-mono text-lg font-bold text-[#F07842] tabular-nums">
              +{sessionState.earnedPoints}
            </span>
          </div>
        </div>

        {/* Secret Word Card (ONLY on Player's Phone) */}
        {activeWord && (
          <div className="flex-1 flex flex-col justify-center gap-4">
            <div className="bg-gradient-to-br from-[#14543D] to-[#0E3D2C] border-2 border-[#14543D] rounded-3xl p-5 sm:p-7 text-center text-white shadow-lg space-y-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-[#EAF2EE]/85">
                <span>الكلمة السرية المطلوب شرحها</span>
                <span className="px-2 py-0.5 rounded-md bg-white/15 text-white">
                  {activeWord.difficulty}
                </span>
              </div>

              <div className="py-4 sm:py-6">
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words">
                  {activeWord.word}
                </h2>
              </div>

              <p className="text-[11px] font-semibold text-[#EAF2EE]/80">
                اشرح الكلمة لفريقك بالإيماء أو الوصف بدون نطقها أو نطق أي كلمة ممنوعة أدناه
              </p>
            </div>

            {/* Forbidden Words Box */}
            <div className="bg-white border-2 border-rose-200 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-rose-700">
                <Ban className="w-4 h-4 shrink-0" />
                <span>الكلمات الممنوعة (يُمنع قولها أثناء الشرح):</span>
              </div>

              {activeWord.forbiddenWords.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {activeWord.forbiddenWords.map((fw, idx) => (
                    <div
                      key={`${fw}_${idx}`}
                      className="px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-200/80 text-center text-sm font-bold text-rose-900 select-none"
                    >
                      {fw}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#777B73]">
                  لا توجد كلمات ممنوعة إضافية لهذه البطاقة — يُمنع فقط نطق الكلمة نفسها.
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Thumb-Zone Bottom Action Controls (56px high touch targets) */}
      <footer className="sticky bottom-0 z-20 bg-[#FFFFFF]/95 backdrop-blur border-t border-[#E5E8DD] p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleAction('correct')}
            className="min-h-[56px] rounded-2xl bg-[#14543D] hover:bg-[#0E3D2C] active:scale-[0.98] text-white font-bold text-base flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-60"
          >
            <CheckCircle2 className="w-5 h-5 text-[#86EFAC] shrink-0" />
            <span>
              {busyAction === 'correct'
                ? 'جاري الحفظ...'
                : `صحيحة (+${sessionState.pointsPerCorrectWord})`}
            </span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleAction('skip')}
            className="min-h-[56px] rounded-2xl bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.98] text-white font-bold text-base flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-60"
          >
            <SkipForward className="w-5 h-5 shrink-0" />
            <span>{busyAction === 'skip' ? 'جاري التخطي...' : 'تخطي الكلمة'}</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
