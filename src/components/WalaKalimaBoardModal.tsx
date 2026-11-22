import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Clock,
  Lock,
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
  /** Optional shared session state when opened by non-host players in Online Mode */
  sharedOnlineSession?: {
    sessionId: string;
    qrPath?: string;
    teamName: string;
    playerName: string;
    contentTypeLabel: string;
    status: WalaKalimaSessionPublicStatus['status'];
    correctCount: number;
    skippedCount: number;
    earnedPoints: number;
    totalWords: number;
    timerSeconds: number;
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
          if (nextStatus.correctCount > 0) soundFX.playCorrect();
          else soundFX.playTimeUp();
        }
        lastSoundStatusRef.current = nextStatus.status;
      }

      const syncSig = `${nextStatus.status}_${nextStatus.correctCount}_${nextStatus.skippedCount}`;
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
    }, 2500);

    return () => {
      unsubscribeStream();
      window.clearInterval(pollInterval);
    };
  }, [hostSession?.sessionId, hostSession?.hostSecret, onOnlineSessionStatusSync]);

  // Smooth local countdown synced to server expiresAt while round is active
  useEffect(() => {
    if (!effectiveStatus || effectiveStatus.status !== 'active' || !effectiveStatus.expiresAt) {
      return;
    }
    const updateClock = () => {
      const remaining = Math.max(
        0,
        Math.ceil(((effectiveStatus.expiresAt || 0) - Date.now()) / 1000)
      );
      setDisplaySecondsLeft(remaining);
    };
    updateClock();
    const timer = window.setInterval(updateClock, 400);
    return () => window.clearInterval(timer);
  }, [effectiveStatus?.status, effectiveStatus?.expiresAt]);

  const handleStartRoundAndGenerateQr = async () => {
    if (!canControl || creating) return;
    const chosenName = (selectedPlayerName || customPlayerName || '').trim() || `لاعب ${activeTeam.name}`;
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

  const handleForceFinish = async () => {
    if (!hostSession || !canControl) return;
    try {
      const updated = await hostActionWalaKalimaRound(
        hostSession.sessionId,
        hostSession.hostSecret,
        'finish'
      );
      setLiveStatus(updated);
      if (onOnlineSessionStatusSync) {
        await onOnlineSessionStatusSync(updated);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر إنهاء الجولة.');
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

  const activeStatusValue = effectiveStatus?.status || sharedOnlineSession?.status || null;
  const activeCorrectCount =
    effectiveStatus?.correctCount ?? sharedOnlineSession?.correctCount ?? 0;
  const activeSkippedCount =
    effectiveStatus?.skippedCount ?? sharedOnlineSession?.skippedCount ?? 0;
  const activeEarnedPoints =
    effectiveStatus?.earnedPoints ?? sharedOnlineSession?.earnedPoints ?? 0;
  const activeTotalWords =
    effectiveStatus?.totalWords ?? sharedOnlineSession?.totalWords ?? settings.wordsPerRound;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4"
      dir="rtl"
    >
      <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-3xl p-4 sm:p-6 md:p-7 max-w-xl w-full max-h-[94dvh] overflow-y-auto space-y-5 shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-xs font-bold px-3 py-1 rounded-lg text-white inline-flex items-center gap-1.5"
                style={{ backgroundColor: activeTeam.color || '#14543D' }}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{activeTeam.name}</span>
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#FEF2EC] text-[#D9602B] border border-[#F07842]/30">
                ولا كلمة · QR
              </span>
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

        {/* PHASE 1: PLAYER SELECTION BEFORE GENERATING QR */}
        {!activeStatusValue && canControl && (
          <div className="space-y-5">
            <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#14543D]">
                <UserCheck className="w-4 h-4 text-[#F07842]" />
                <span>اختاروا اللاعب اللي بيشرح لفريق {activeTeam.name}</span>
              </div>
              <p className="text-xs text-[#777B73] leading-relaxed">
                بيظهر رمز QR على الشاشة، يمسحه اللاعب بجواله لتظهر له الكلمة السرية والكلمات الممنوعة وحده فقط.
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
                    : 'اسم اللاعب المشارك:'}
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

            {/* Round Parameters Summary (No pills, clean grid) */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-2xl bg-[#EAF2EE] border border-[#14543D]/15 p-3">
                <div className="text-[11px] font-bold text-[#777B73]">مدة الجولة</div>
                <div className="font-mono text-lg font-bold text-[#14543D] tabular-nums mt-0.5">
                  {settings.timerSeconds} ث
                </div>
              </div>
              <div className="rounded-2xl bg-[#FEF2EC] border border-[#F07842]/25 p-3">
                <div className="text-[11px] font-bold text-[#777B73]">عدد الكلمات</div>
                <div className="font-mono text-lg font-bold text-[#D9602B] tabular-nums mt-0.5">
                  {settings.wordsPerRound}
                </div>
              </div>
              <div className="rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] p-3">
                <div className="text-[11px] font-bold text-[#777B73]">نقاط الكلمة</div>
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
                <span>{creating ? 'جاري تجهيز الرمز...' : 'إظهار رمز QR للاعب'}</span>
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
            <QrCode className="w-10 h-10 text-[#F07842] mx-auto animate-pulse" />
            <p className="text-sm font-bold text-[#252824]">
              يقوم المضيف باختيار اللاعب وتجهيز رمز QR لجولة «ولا كلمة»...
            </p>
          </div>
        )}

        {/* PHASE 2A: WAITING FOR QR SCAN */}
        {activeStatusValue === 'waiting_scan' && (
          <div className="space-y-4 text-center">
            <div className="bg-[#F3F5E9] border-2 border-dashed border-[#14543D]/35 rounded-3xl p-5 flex flex-col items-center gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#14543D]">
                  الدور للاعب:{' '}
                  <span className="text-[#D9602B]">
                    {effectiveStatus?.playerName || sharedOnlineSession?.playerName}
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#252824]">
                  امسح رمز QR بكاميرا جوالك لبدء الشرح فوراً
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
                <span>الرمز مخصص لجوال واحد فقط ومرتبط بهذه الجولة، ولا تظهر الكلمة هنا</span>
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

        {/* PHASE 2B: ACTIVE EXPLAINING ROUND (SECRET WORD SHOWN ONLY ON PLAYER PHONE) */}
        {activeStatusValue === 'active' && (
          <div className="space-y-5">
            <div className="rounded-3xl bg-gradient-to-br from-[#14543D] to-[#0E3D2C] text-white p-5 sm:p-6 space-y-4 shadow-md">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#EAF2EE]">
                  <Lock className="w-4 h-4 text-[#F07842]" />
                  <span>الكلمة السرية ظاهرة على جوال {effectiveStatus?.playerName} فقط</span>
                </div>

                <div
                  className={`px-3 py-1.5 rounded-xl font-mono text-lg sm:text-xl font-bold tabular-nums flex items-center gap-1.5 ${
                    displaySecondsLeft <= 10
                      ? 'bg-[#F07842] text-white animate-pulse'
                      : 'bg-white/15 text-white'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{displaySecondsLeft} ث</span>
                </div>
              </div>

              <div className="text-center py-2 space-y-1.5">
                <div className="text-xs font-semibold text-[#EAF2EE]/80">
                  حاولوا تخمين الإجابة من شرح اللاعب بدون الكلمات الممنوعة!
                </div>
                <div className="font-display text-xl sm:text-2xl font-bold text-white">
                  التحدي جارٍ الآن...
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center pt-1">
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[11px] text-[#EAF2EE]/80 font-semibold">إجابات صحيحة</div>
                  <div className="font-mono text-2xl font-bold text-[#86EFAC] tabular-nums mt-0.5">
                    {activeCorrectCount}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[11px] text-[#EAF2EE]/80 font-semibold">تخطي</div>
                  <div className="font-mono text-2xl font-bold text-[#FDE68A] tabular-nums mt-0.5">
                    {activeSkippedCount}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[11px] text-[#EAF2EE]/80 font-semibold">التقدم</div>
                  <div className="font-mono text-2xl font-bold text-white tabular-nums mt-0.5">
                    {Math.min((effectiveStatus?.currentIndex ?? 0) + 1, activeTotalWords)} /{' '}
                    {activeTotalWords}
                  </div>
                </div>
              </div>
            </div>

            {canControl && (
              <button
                type="button"
                onClick={handleForceFinish}
                className="w-full min-h-[48px] py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-sm cursor-pointer transition-colors"
              >
                إنهاء الجولة واحتساب النقاط الحالية
              </button>
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
                ) : (
                  <Sparkles className="w-7 h-7 text-[#F07842]" />
                )}
              </div>

              <div className="space-y-1">
                <h4 className="font-display text-xl sm:text-2xl font-bold text-[#252824]">
                  {effectiveStatus?.endReason === 'completed_all'
                    ? 'انتهت كلمات الجولة!'
                    : effectiveStatus?.endReason === 'time_up'
                    ? 'انتهى الوقت!'
                    : 'انتهت جولة ولا كلمة'}
                </h4>
                <p className="text-xs sm:text-sm font-semibold text-[#52574E]">
                  فريق {activeTeam.name} · اللاعب{' '}
                  {effectiveStatus?.playerName || sharedOnlineSession?.playerName}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-white rounded-2xl border border-[#E5E8DD] p-3">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#14543D]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>صحيحة</span>
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#14543D] tabular-nums mt-1">
                    {activeCorrectCount}
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
                    +{activeEarnedPoints}
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
                    : 'إنهاء الدور بدون نقاط والانتقال للفريق التالي'}
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
