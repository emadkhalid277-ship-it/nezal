import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Clock,
  Hand,
  Lock,
  MicOff,
  QrCode,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { DifficultyLevel } from '../types/game';
import {
  WalaKalimaCreateSessionResponse,
  WalaKalimaEndReason,
  WalaKalimaSessionPublicStatus,
  WalaKalimaSettings,
  resolveWalaKalimaContentType,
} from '../types/walaKalima';
import {
  createWalaKalimaRoundSession,
  getWalaKalimaHostStatus,
  hostActionWalaKalimaRound,
  subscribeWalaKalimaHostStream,
} from '../services/walaKalimaService';
import { soundFX } from '../services/soundEffects';
import { CircularCountdownTimer } from './CircularCountdownTimer';

interface WalaKalimaBoardModalProps {
  matchId: string;
  tileKey: string;
  subcategoryId?: string;
  subcategoryName: string;
  preferredDifficulty?: DifficultyLevel;
  activeTeam: {
    id: string;
    name: string;
    color: string;
    players?: string[];
  };
  canControl: boolean;
  settings: WalaKalimaSettings;
  /** Optional shared public session state when opened by non-host players in Online Mode (never contains words) */
  sharedOnlineSession?: {
    sessionId: string;
    qrPath?: string;
    teamName: string;
    playerName: string;
    contentTypeLabel: string;
    status: WalaKalimaSessionPublicStatus['status'];
    correctCount: number;
    skippedCount: number;
    maxSkips?: number;
    pointsPerCorrectWord?: number;
    earnedPoints: number;
    totalWords: number;
    timerSeconds: number;
    startedAt?: number | null;
    expiresAt?: number | null;
    endReason?: WalaKalimaEndReason;
  } | null;
  onOnlineSessionCreated?: (session: WalaKalimaCreateSessionResponse) => Promise<void> | void;
  onOnlineSessionStatusSync?: (status: WalaKalimaSessionPublicStatus) => Promise<void> | void;
  onCommitResult: (params: {
    earnedPoints: number;
    correctCount: number;
    skippedCount: number;
    tileKey: string;
    sessionId: string;
  }) => Promise<void> | void;
  onCancel: () => Promise<void> | void;
}

export const WalaKalimaBoardModal: React.FC<WalaKalimaBoardModalProps> = ({
  matchId,
  tileKey,
  subcategoryId,
  subcategoryName,
  preferredDifficulty,
  activeTeam,
  canControl,
  settings,
  sharedOnlineSession,
  onOnlineSessionCreated,
  onOnlineSessionStatusSync,
  onCommitResult,
  onCancel,
}) => {
  const contentMeta = useMemo(
    () => resolveWalaKalimaContentType({ subcategoryId, subcategoryName }),
    [subcategoryId, subcategoryName]
  );

  const rosterPlayers = useMemo(
    () => (activeTeam.players || []).map((p) => p.trim()).filter(Boolean),
    [activeTeam.players]
  );

  const [selectedPlayerName, setSelectedPlayerName] = useState<string>(
    rosterPlayers[0] || ''
  );
  const [customPlayerName, setCustomPlayerName] = useState<string>(
    rosterPlayers[0] ? '' : `لاعب ${activeTeam.name}`
  );
  const [creating, setCreating] = useState(false);
  const [hostBusy, setHostBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [hostSession, setHostSession] = useState<WalaKalimaCreateSessionResponse | null>(null);
  const [liveStatus, setLiveStatus] = useState<WalaKalimaSessionPublicStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [displaySecondsLeft, setDisplaySecondsLeft] = useState<number>(settings.timerSeconds);

  const lastSyncedPhaseRef = useRef<string>('');
  const lastSoundStatusRef = useRef<string>('');

  const effectiveStatus = liveStatus || hostSession;

  // Generate QR Data URL strictly from qrPath (contains zero secret words)
  useEffect(() => {
    const rawPath = hostSession?.qrPath || sharedOnlineSession?.qrPath;
    if (!rawPath) {
      setQrDataUrl('');
      return;
    }
    const fullUrl =
      rawPath.startsWith('http://') || rawPath.startsWith('https://')
        ? rawPath
        : `${window.location.origin}${rawPath}`;

    let cancelled = false;
    QRCode.toDataURL(fullUrl, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#14543D',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [hostSession?.qrPath, sharedOnlineSession?.qrPath]);

  // Subscribe to host SSE stream + fallback status polling
  useEffect(() => {
    if (!hostSession?.sessionId || !hostSession?.hostSecret) return;

    const handleStatus = (nextStatus: WalaKalimaSessionPublicStatus) => {
      setLiveStatus(nextStatus);
      setDisplaySecondsLeft(nextStatus.remainingSeconds);

      if (lastSoundStatusRef.current !== nextStatus.status) {
        if (nextStatus.status === 'active') {
          soundFX.playTileOpen();
        } else if (nextStatus.status === 'finished') {
          if (nextStatus.earnedPoints > 0) soundFX.playCorrect();
          else soundFX.playTimeUp();
        }
        lastSoundStatusRef.current = nextStatus.status;
      }

      const syncSig = `${nextStatus.status}_${nextStatus.correctCount}_${nextStatus.skippedCount}_${nextStatus.endReason || ''}`;
      if (onOnlineSessionStatusSync && lastSyncedPhaseRef.current !== syncSig) {
        lastSyncedPhaseRef.current = syncSig;
        void onOnlineSessionStatusSync(nextStatus);
      }
    };

    const unsubscribeStream = subscribeWalaKalimaHostStream(
      hostSession.sessionId,
      hostSession.hostSecret,
      handleStatus
    );

    const pollInterval = window.setInterval(() => {
      void getWalaKalimaHostStatus(hostSession.sessionId, hostSession.hostSecret)
        .then(handleStatus)
        .catch(() => {
          // ignore transient poll failures
        });
    }, 1500);

    return () => {
      unsubscribeStream();
      window.clearInterval(pollInterval);
    };
  }, [hostSession?.sessionId, hostSession?.hostSecret, onOnlineSessionStatusSync]);

  const syncedExpiresAt = effectiveStatus?.expiresAt ?? sharedOnlineSession?.expiresAt ?? null;
  const activeStatusValue = effectiveStatus?.status || sharedOnlineSession?.status || null;

  // Smooth local countdown synced to server expiresAt while round is active
  useEffect(() => {
    if (activeStatusValue !== 'active' || !syncedExpiresAt) {
      return;
    }
    const updateClock = () => {
      const remaining = Math.max(0, Math.ceil((syncedExpiresAt - Date.now()) / 1000));
      setDisplaySecondsLeft(remaining);
    };
    updateClock();
    const timer = window.setInterval(updateClock, 300);
    return () => window.clearInterval(timer);
  }, [activeStatusValue, syncedExpiresAt]);

  const handleStartRoundAndGenerateQr = async () => {
    if (!canControl || creating) return;
    const chosenName =
      (selectedPlayerName || customPlayerName || '').trim() || `لاعب ${activeTeam.name}`;
    setCreating(true);
    setErrorMsg(null);
    try {
      const created = await createWalaKalimaRoundSession({
        matchId,
        tileKey,
        teamId: activeTeam.id,
        teamName: activeTeam.name,
        playerName: chosenName,
        contentType: contentMeta.id,
        preferredDifficulty,
      });
      setHostSession(created);
      setLiveStatus(created);
      setDisplaySecondsLeft(created.timerSeconds);
      soundFX.playTileOpen();
      if (onOnlineSessionCreated) {
        await onOnlineSessionCreated(created);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر بدء جولة ولا كلمة.');
    } finally {
      setCreating(false);
    }
  };

  const handleHostAction = async (action: 'correct' | 'finish') => {
    if (!hostSession || !canControl || hostBusy) return;
    setHostBusy(true);
    setErrorMsg(null);
    try {
      const updated = await hostActionWalaKalimaRound(
        hostSession.sessionId,
        hostSession.hostSecret,
        action
      );
      if (updated.earnedPoints > 0) soundFX.playCorrect();
      else soundFX.playTimeUp();
      setLiveStatus(updated);
      if (onOnlineSessionStatusSync) {
        await onOnlineSessionStatusSync(updated);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر تحديث حالة الجولة.');
    } finally {
      setHostBusy(false);
    }
  };

  const handleCancelAndExit = async () => {
    if (hostSession && canControl && effectiveStatus?.status !== 'finished') {
      try {
        await hostActionWalaKalimaRound(
          hostSession.sessionId,
          hostSession.hostSecret,
          'cancel'
        );
      } catch {
        // ignore cleanup failure
      }
    }
    await onCancel();
  };

  const handleCommitAndClose = async () => {
    if (!canControl || committing) return;
    const finalStats = effectiveStatus;
    if (!finalStats) return;
    setCommitting(true);
    try {
      await onCommitResult({
        earnedPoints: finalStats.earnedPoints,
        correctCount: finalStats.correctCount,
        skippedCount: finalStats.skippedCount,
        tileKey,
        sessionId: finalStats.sessionId,
      });
    } finally {
      setCommitting(false);
    }
  };

  const activeCorrectCount =
    effectiveStatus?.correctCount ?? sharedOnlineSession?.correctCount ?? 0;
  const activeSkippedCount =
    effectiveStatus?.skippedCount ?? sharedOnlineSession?.skippedCount ?? 0;
  const activeMaxSkips =
    effectiveStatus?.maxSkips ?? sharedOnlineSession?.maxSkips ?? settings.maxSkips ?? 3;
  const activePointsPerWord =
    effectiveStatus?.pointsPerCorrectWord ??
    sharedOnlineSession?.pointsPerCorrectWord ??
    settings.pointsPerCorrectWord;
  const activeEarnedPoints =
    effectiveStatus?.earnedPoints ?? sharedOnlineSession?.earnedPoints ?? 0;
  const activeTimerSeconds =
    effectiveStatus?.timerSeconds ?? sharedOnlineSession?.timerSeconds ?? settings.timerSeconds;
  const activeEndReason = effectiveStatus?.endReason ?? sharedOnlineSession?.endReason ?? null;
  const activePlayerName =
    effectiveStatus?.playerName || sharedOnlineSession?.playerName || `لاعب ${activeTeam.name}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4"
      dir="rtl"
    >
      <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-3xl p-4 sm:p-6 md:p-7 max-w-xl w-full max-h-[94dvh] overflow-y-auto space-y-5 shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span
                className="px-3 py-1 rounded-lg text-white inline-flex items-center gap-1.5"
                style={{ backgroundColor: activeTeam.color || '#14543D' }}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{activeTeam.name}</span>
              </span>
              <span className="text-[#D9602B]">ولا كلمة · تمثيل صامت (QR)</span>
            </div>
            <h3 className="font-display text-lg sm:text-xl font-bold text-[#252824]">
              {contentMeta.label}
            </h3>
          </div>

          {(!activeStatusValue || activeStatusValue === 'waiting_scan') && canControl && (
            <button
              type="button"
              onClick={handleCancelAndExit}
              aria-label="إغلاق الجولة"
              className="min-w-[40px] min-h-[40px] rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#777B73] hover:text-[#252824] flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm font-bold text-rose-800">
            {errorMsg}
          </div>
        )}

        {/* PHASE 1: ACTOR SELECTION BEFORE GENERATING QR */}
        {!activeStatusValue && canControl && (
          <div className="space-y-5">
            <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#14543D]">
                <UserCheck className="w-4 h-4 text-[#F07842]" />
                <span>اختاروا الممثل لفريق {activeTeam.name}</span>
              </div>
              <p className="text-xs text-[#52574E] leading-relaxed">
                يمسح الممثل رمز QR بهاتفه لتظهر له الكلمة السرية وحده فقط، ثم يمثلها بالحركات والإشارات وتعبيرات الوجه دون كلام خلال {settings.timerSeconds} ثانية.
              </p>

              {rosterPlayers.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {rosterPlayers.map((pName) => {
                    const isSelected = selectedPlayerName === pName;
                    return (
                      <button
                        key={pName}
                        type="button"
                        onClick={() => {
                          setSelectedPlayerName(pName);
                          setCustomPlayerName('');
                        }}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border-2 text-xs sm:text-sm font-bold transition-all cursor-pointer truncate ${
                          isSelected
                            ? 'bg-[#14543D] border-[#14543D] text-white shadow-sm'
                            : 'bg-white border-[#E5E8DD] text-[#252824] hover:border-[#F07842]'
                        }`}
                      >
                        {pName}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-[#52574E]">
                  {rosterPlayers.length > 0
                    ? 'أو اكتب اسم لاعب آخر من الفريق:'
                    : 'اسم اللاعب الممثل:'}
                </label>
                <input
                  type="text"
                  value={customPlayerName}
                  onChange={(e) => {
                    setCustomPlayerName(e.target.value);
                    if (e.target.value.trim()) setSelectedPlayerName('');
                  }}
                  placeholder={`مثال: لاعب ${activeTeam.name}`}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#E5E8DD] bg-white text-sm font-semibold text-[#252824] focus:outline-none focus:border-[#14543D]"
                />
              </div>
            </div>

            {/* Round Parameters Summary */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-2xl bg-[#EAF2EE] border border-[#14543D]/15 p-3">
                <div className="text-[11px] font-bold text-[#777B73]">مدة التمثيل</div>
                <div className="font-mono text-lg font-bold text-[#14543D] tabular-nums mt-0.5">
                  {settings.timerSeconds} ث
                </div>
              </div>
              <div className="rounded-2xl bg-[#FEF2EC] border border-[#F07842]/25 p-3">
                <div className="text-[11px] font-bold text-[#777B73]">التخطي المتاح</div>
                <div className="font-mono text-lg font-bold text-[#D9602B] tabular-nums mt-0.5">
                  {settings.maxSkips ?? 3}
                </div>
              </div>
              <div className="rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] p-3">
                <div className="text-[11px] font-bold text-[#777B73]">نقاط الفوز</div>
                <div className="font-mono text-lg font-bold text-[#14543D] tabular-nums mt-0.5">
                  +{settings.pointsPerCorrectWord}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={creating}
                onClick={handleStartRoundAndGenerateQr}
                className="flex-1 min-h-[48px] px-5 py-3 rounded-2xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all disabled:opacity-60"
              >
                <QrCode className="w-5 h-5" />
                <span>{creating ? 'جاري تجهيز الرمز...' : 'إظهار رمز QR للممثل'}</span>
              </button>
              <button
                type="button"
                onClick={handleCancelAndExit}
                className="min-h-[48px] px-5 py-3 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#52574E] hover:text-[#252824] font-bold text-sm cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {/* NON-HOST INITIAL WAITING SCREEN IN ONLINE MODE */}
        {!activeStatusValue && !canControl && (
          <div className="py-10 text-center space-y-3">
            <QrCode className="w-10 h-10 text-[#F07842] mx-auto" />
            <p className="text-sm font-bold text-[#252824]">
              يقوم المضيف باختيار الممثل وتجهيز رمز QR لجولة «ولا كلمة»...
            </p>
          </div>
        )}

        {/* PHASE 2A: WAITING FOR QR SCAN */}
        {activeStatusValue === 'waiting_scan' && (
          <div className="space-y-4 text-center">
            <div className="bg-[#F3F5E9] border-2 border-dashed border-[#14543D]/35 rounded-3xl p-5 flex flex-col items-center gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#14543D]">
                  الدور للممثل:{' '}
                  <span className="text-[#D9602B]">{activePlayerName}</span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#252824]">
                  امسح رمز QR بكاميرا جوالك لتظهر الكلمة السرية ويبدأ مؤقت الـ {activeTimerSeconds} ثانية
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border-2 border-[#14543D]/20 shadow-sm">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="رمز QR لجولة ولا كلمة"
                    className="w-52 h-52 sm:w-60 sm:h-60 object-contain"
                  />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center text-xs text-[#777B73]">
                    جاري توليد رمز QR...
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#14543D] bg-[#EAF2EE] px-4 py-2 rounded-xl border border-[#14543D]/15">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>الرمز مخصص لجوال الممثل فقط — الكلمة السرية لا تظهر هنا إطلاقاً</span>
              </div>
            </div>

            {canControl && (
              <button
                type="button"
                onClick={handleCancelAndExit}
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-bold text-[#777B73] hover:text-[#252824] cursor-pointer"
              >
                إلغاء الجولة والعودة للوحة
              </button>
            )}
          </div>
        )}

        {/* PHASE 2B: ACTIVE CHARADES ROUND (SECRET WORD NEVER EXPOSED HERE) */}
        {activeStatusValue === 'active' && (
          <div className="space-y-5">
            <div className="rounded-3xl bg-gradient-to-br from-[#14543D] to-[#0E3D2C] text-white p-5 sm:p-6 space-y-5 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#EAF2EE]">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#F07842] shrink-0" />
                  <span>الكلمة السرية على جوال {activePlayerName} فقط</span>
                </div>
                <span className="text-[#86EFAC]">التمثيل الصامت جارٍ</span>
              </div>

              {/* Animated Circular Countdown Timer Centerpiece */}
              <div className="flex flex-col items-center justify-center gap-3 py-1">
                <CircularCountdownTimer
                  totalSeconds={activeTimerSeconds}
                  remainingSeconds={displaySecondsLeft}
                  expiresAt={syncedExpiresAt}
                  isActive={true}
                  size={140}
                  strokeWidth={11}
                  variant="dark"
                />

                <div className="text-center space-y-1">
                  <div className="font-display text-lg sm:text-xl font-bold text-white">
                    خمّن الكلمة من حركات {activePlayerName}!
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-[#EAF2EE]/85">
                    <span className="inline-flex items-center gap-1">
                      <Hand className="w-3.5 h-3.5 text-[#86EFAC]" />
                      <span>إشارات وحركات فقط</span>
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MicOff className="w-3.5 h-3.5 text-[#FDBA74]" />
                      <span>دون كلام أو أصوات نهائياً</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center pt-1">
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[11px] text-[#EAF2EE]/80 font-semibold">حالة الجولة</div>
                  <div className="font-sans text-sm sm:text-base font-bold text-[#86EFAC] mt-1">
                    جارية الآن
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[11px] text-[#EAF2EE]/80 font-semibold">تخطي</div>
                  <div className="font-mono text-xl font-bold text-[#FDE68A] tabular-nums mt-0.5">
                    {activeSkippedCount} / {activeMaxSkips}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[11px] text-[#EAF2EE]/80 font-semibold">جائزة الجولة</div>
                  <div className="font-mono text-xl font-bold text-white tabular-nums mt-0.5">
                    +{activePointsPerWord}
                  </div>
                </div>
              </div>
            </div>

            {canControl && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={hostBusy}
                  onClick={() => void handleHostAction('correct')}
                  className="min-h-[48px] px-4 py-3 rounded-2xl bg-[#14543D] hover:bg-[#0E3D2C] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#86EFAC] shrink-0" />
                  <span>تم التخمين الصحيح (+{activePointsPerWord})</span>
                </button>

                <button
                  type="button"
                  disabled={hostBusy}
                  onClick={() => void handleHostAction('finish')}
                  className="min-h-[48px] px-4 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-sm cursor-pointer transition-colors disabled:opacity-60"
                >
                  إنهاء الجولة (0 نقطة)
                </button>
              </div>
            )}
          </div>
        )}

        {/* PHASE 3: ROUND FINISHED -> RESULT & SCORE CONFIRMATION */}
        {(activeStatusValue === 'finished' || activeStatusValue === 'expired') && (
          <div className="space-y-5">
            <div className="rounded-3xl bg-[#F3F5E9] border-2 border-[#14543D]/25 p-5 sm:p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#14543D] text-white flex items-center justify-center mx-auto shadow-sm">
                {activeEarnedPoints > 0 ? (
                  <Trophy className="w-7 h-7 text-[#FDE68A]" />
                ) : activeEndReason === 'time_up' ? (
                  <Clock className="w-7 h-7 text-[#F07842]" />
                ) : (
                  <Sparkles className="w-7 h-7 text-[#F07842]" />
                )}
              </div>

              <div className="space-y-1">
                <h4 className="font-display text-xl sm:text-2xl font-bold text-[#252824]">
                  {activeEarnedPoints > 0
                    ? 'إجابة صحيحة! انتهت الجولة بنجاح'
                    : activeEndReason === 'time_up'
                    ? 'انتهى الوقت! (0 نقطة)'
                    : 'انتهت الجولة بدون نقاط'}
                </h4>
                <p className="text-xs sm:text-sm font-semibold text-[#52574E]">
                  فريق {activeTeam.name} · الممثل {activePlayerName}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-white rounded-2xl border border-[#E5E8DD] p-3">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#14543D]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>النتيجة</span>
                  </div>
                  <div className="font-sans text-sm sm:text-base font-bold text-[#14543D] mt-1.5">
                    {activeCorrectCount > 0 ? 'تخمين صحيح' : 'لم يُخمن'}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-[#E5E8DD] p-3">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#777B73]">
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>تخطي</span>
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#52574E] tabular-nums mt-1">
                    {activeSkippedCount}
                  </div>
                </div>
                <div className="bg-[#EAF2EE] rounded-2xl border border-[#14543D]/30 p-3">
                  <div className="text-[11px] font-bold text-[#14543D]">النقاط</div>
                  <div className="font-mono text-2xl font-bold text-[#F07842] tabular-nums mt-1">
                    {activeEarnedPoints > 0 ? `+${activeEarnedPoints}` : '0'}
                  </div>
                </div>
              </div>
            </div>

            {canControl ? (
              <button
                type="button"
                disabled={committing}
                onClick={handleCommitAndClose}
                className="w-full min-h-[50px] px-6 py-3.5 rounded-2xl bg-[#14543D] hover:bg-[#0E3D2C] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-60"
              >
                <CheckCircle2 className="w-5 h-5 text-[#86EFAC]" />
                <span>
                  {committing
                    ? 'جاري تسجيل النقاط...'
                    : activeEarnedPoints > 0
                    ? `اعتماد +${activeEarnedPoints} نقطة لفريق ${activeTeam.name}`
                    : 'تسجيل 0 نقطة والانتقال للفريق التالي'}
                </span>
              </button>
            ) : (
              <div className="text-center text-xs font-bold text-[#777B73] py-2">
                بانتظار اعتماد المضيف للنتيجة والعودة إلى لوحة المباراة...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
