import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DIFFICULTY_TO_POINTS, DifficultyLevel, PointValue } from '../types/game';
import {
  WalaKalimaCreateSessionResponse,
  WalaKalimaEndReason,
  WalaKalimaSessionPublicStatus,
  WalaKalimaSettings,
  getWalaKalimaPointLevelMeta,
  resolveWalaKalimaContentType,
} from '../types/walaKalima';
import {
  computeClockOffsetMs,
  createWalaKalimaRoundSession,
  fetchWalaKalimaServerTimeOffset,
  getWalaKalimaHostStatus,
  hostActionWalaKalimaRound,
  subscribeWalaKalimaHostStream,
} from '../services/walaKalimaService';
import { soundFX } from '../services/soundEffects';
import { CircularCountdownTimer } from './CircularCountdownTimer';
import { WhoAnsweredCorrectlyPanel } from './WhoAnsweredCorrectlyPanel';

interface WalaKalimaBoardModalProps {
  matchId: string;
  tileKey: string;
  subcategoryId?: string;
  subcategoryName: string;
  initialPoints?: PointValue;
  preferredDifficulty?: DifficultyLevel;
  activeTeam: {
    id: string;
    name: string;
    color: string;
    players?: string[];
  };
  teams?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
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
    serverNow?: number;
    startedAt?: number | null;
    expiresAt?: number | null;
    endReason?: WalaKalimaEndReason;
  } | null;
  onOnlineSessionCreated?: (session: WalaKalimaCreateSessionResponse) => Promise<void> | void;
  onOnlineSessionStatusSync?: (status: WalaKalimaSessionPublicStatus) => Promise<void> | void;
  onCommitResult: (params: {
    awardedTeamIndex: number | null;
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
  initialPoints,
  preferredDifficulty,
  activeTeam,
  teams,
  canControl,
  settings,
  sharedOnlineSession,
  onOnlineSessionCreated,
  onOnlineSessionStatusSync,
  onCommitResult,
  onCancel,
}) => {
  const resolvedTeams = useMemo(
    () =>
      teams && teams.length > 0
        ? teams
        : [{ id: activeTeam.id, name: activeTeam.name, color: activeTeam.color }],
    [teams, activeTeam.id, activeTeam.name, activeTeam.color]
  );

  const contentMeta = useMemo(
    () => resolveWalaKalimaContentType({ subcategoryId, subcategoryName }),
    [subcategoryId, subcategoryName]
  );

  const rosterPlayers = useMemo(
    () => (activeTeam.players || []).map((p) => p.trim()).filter(Boolean),
    [activeTeam.players]
  );

  const selectedPoints: PointValue =
    initialPoints ||
    (preferredDifficulty ? DIFFICULTY_TO_POINTS[preferredDifficulty] : 100);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string>(
    rosterPlayers[0] || ''
  );
  const [customPlayerName, setCustomPlayerName] = useState<string>(
    rosterPlayers[0] ? '' : `لاعب ${activeTeam.name}`
  );
  const [creating, setCreating] = useState(false);
  const [hostBusy, setHostBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [pendingCommitChoice, setPendingCommitChoice] = useState<number | 'none' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [hostSession, setHostSession] = useState<WalaKalimaCreateSessionResponse | null>(null);
  const [liveStatus, setLiveStatus] = useState<WalaKalimaSessionPublicStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);
  const [streamWarning, setStreamWarning] = useState<string | null>(null);

  const lastSyncedPhaseRef = useRef<string>('');
  const lastSoundStatusRef = useRef<string>('');
  const hasMeasuredRttOffsetRef = useRef(false);
  const committedSessionIdRef = useRef<string | null>(null);

  const effectiveStatus = liveStatus || hostSession;

  const applyHostStatus = useCallback(
    (
      nextStatus: WalaKalimaSessionPublicStatus,
      rttRange?: { t0: number; t1: number }
    ) => {
      if (rttRange) {
        const measured = computeClockOffsetMs(nextStatus.serverNow, rttRange.t0, rttRange.t1);
        if (measured !== null) {
          hasMeasuredRttOffsetRef.current = true;
          setClockOffsetMs(measured);
        }
      } else if (!hasMeasuredRttOffsetRef.current) {
        const approx = computeClockOffsetMs(nextStatus.serverNow);
        if (approx !== null) {
          setClockOffsetMs(approx);
        }
      }

      setLiveStatus(nextStatus);

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
    },
    [onOnlineSessionStatusSync]
  );

  const syncHostNow = useCallback(async () => {
    if (!hostSession?.sessionId || !hostSession?.hostSecret) return;
    try {
      const t0 = Date.now();
      const nextStatus = await getWalaKalimaHostStatus(
        hostSession.sessionId,
        hostSession.hostSecret
      );
      const t1 = Date.now();
      setStreamWarning(null);
      applyHostStatus(nextStatus, { t0, t1 });
    } catch {
      // keep running timer cleanly on last server expiresAt until reconnected
    }
  }, [hostSession?.sessionId, hostSession?.hostSecret, applyHostStatus]);

  // Calibrate clock offset for non-host online spectators viewing sharedOnlineSession
  useEffect(() => {
    if (canControl) return;

    let cancelled = false;
    const calibrateSpectatorClock = async () => {
      const offset = await fetchWalaKalimaServerTimeOffset();
      if (!cancelled && offset !== null) {
        hasMeasuredRttOffsetRef.current = true;
        setClockOffsetMs(offset);
      } else if (!cancelled && !hasMeasuredRttOffsetRef.current && sharedOnlineSession?.serverNow) {
        const approx = computeClockOffsetMs(sharedOnlineSession.serverNow);
        if (approx !== null) {
          setClockOffsetMs(approx);
        }
      }
    };

    void calibrateSpectatorClock();
    const handleResumeOrOnline = () => {
      if (!document.hidden) {
        void calibrateSpectatorClock();
      }
    };
    window.addEventListener('online', handleResumeOrOnline);
    document.addEventListener('visibilitychange', handleResumeOrOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleResumeOrOnline);
      document.removeEventListener('visibilitychange', handleResumeOrOnline);
    };
  }, [canControl, sharedOnlineSession?.sessionId, sharedOnlineSession?.serverNow]);

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

  // Subscribe to host SSE stream + reconnect/visibility recovery + fallback polling
  useEffect(() => {
    if (!hostSession?.sessionId || !hostSession?.hostSecret) return;

    const unsubscribeStream = subscribeWalaKalimaHostStream(
      hostSession.sessionId,
      hostSession.hostSecret,
      (nextStatus) => {
        setStreamWarning(null);
        applyHostStatus(nextStatus);
      },
      () => {
        setStreamWarning('جاري إعادة المزامنة مع الخادم — المؤقت مستمر...');
      },
      () => {
        setStreamWarning(null);
        void syncHostNow();
      }
    );

    const handleResumeOrOnline = () => {
      if (!document.hidden) {
        void syncHostNow();
      }
    };

    window.addEventListener('online', handleResumeOrOnline);
    document.addEventListener('visibilitychange', handleResumeOrOnline);

    const pollInterval = window.setInterval(
      () => {
        void syncHostNow();
      },
      streamWarning ? 1500 : 4000
    );

    return () => {
      unsubscribeStream();
      window.removeEventListener('online', handleResumeOrOnline);
      document.removeEventListener('visibilitychange', handleResumeOrOnline);
      window.clearInterval(pollInterval);
    };
  }, [
    hostSession?.sessionId,
    hostSession?.hostSecret,
    streamWarning,
    applyHostStatus,
    syncHostNow,
  ]);

  const syncedExpiresAt = effectiveStatus?.expiresAt ?? sharedOnlineSession?.expiresAt ?? null;
  const activeStatusValue = effectiveStatus?.status || sharedOnlineSession?.status || null;

  const handleStartRoundAndGenerateQr = async () => {
    if (!canControl || creating) return;
    const chosenName =
      (selectedPlayerName || customPlayerName || '').trim() || `لاعب ${activeTeam.name}`;
    setCreating(true);
    setErrorMsg(null);
    try {
      const selectedLevelMeta = getWalaKalimaPointLevelMeta(selectedPoints);
      const t0 = Date.now();
      const created = await createWalaKalimaRoundSession({
        matchId,
        tileKey,
        teamId: activeTeam.id,
        teamName: activeTeam.name,
        playerName: chosenName,
        contentType: contentMeta.id,
        points: selectedPoints,
        preferredDifficulty: selectedLevelMeta.difficulty,
      });
      const t1 = Date.now();
      const measuredOffset = computeClockOffsetMs(created.serverNow, t0, t1);
      if (measuredOffset !== null) {
        hasMeasuredRttOffsetRef.current = true;
        setClockOffsetMs(measuredOffset);
      }
      setHostSession(created);
      setLiveStatus(created);
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
      const t0 = Date.now();
      const updated = await hostActionWalaKalimaRound(
        hostSession.sessionId,
        hostSession.hostSecret,
        action
      );
      const t1 = Date.now();
      applyHostStatus(updated, { t0, t1 });
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

  const canCloseModal =
    (!activeStatusValue || activeStatusValue === 'waiting_scan') && canControl;

  useEffect(() => {
    if (!canCloseModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void handleCancelAndExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canCloseModal]);

  const handleCommitDecision = async (awardedTeamIndex: number | null) => {
    if (!canControl || committing) return;
    const finalStats =
      effectiveStatus ||
      (sharedOnlineSession
        ? {
            sessionId: sharedOnlineSession.sessionId,
            earnedPoints: sharedOnlineSession.earnedPoints,
            correctCount: sharedOnlineSession.correctCount,
            skippedCount: sharedOnlineSession.skippedCount,
          }
        : null);
    if (!finalStats) return;
    if (
      awardedTeamIndex !== null &&
      (!Number.isInteger(awardedTeamIndex) ||
        awardedTeamIndex < 0 ||
        awardedTeamIndex >= resolvedTeams.length)
    ) {
      return;
    }
    if (committedSessionIdRef.current === finalStats.sessionId) return;
    committedSessionIdRef.current = finalStats.sessionId;
    setCommitting(true);
    setPendingCommitChoice(awardedTeamIndex === null ? 'none' : awardedTeamIndex);
    setErrorMsg(null);
    const awardedPoints = awardedTeamIndex !== null ? activePointsPerWord : 0;
    try {
      await onCommitResult({
        awardedTeamIndex,
        earnedPoints: awardedPoints,
        correctCount: finalStats.correctCount,
        skippedCount: finalStats.skippedCount,
        tileKey,
        sessionId: finalStats.sessionId,
      });
    } catch (err) {
      committedSessionIdRef.current = null;
      setPendingCommitChoice(null);
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر تسجيل النتيجة. حاول مرة أخرى.');
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
    selectedPoints;
  const activeLevelMeta = getWalaKalimaPointLevelMeta(activePointsPerWord);
  const selectedLevelMeta = getWalaKalimaPointLevelMeta(selectedPoints);
  const activeEarnedPoints =
    effectiveStatus?.earnedPoints ?? sharedOnlineSession?.earnedPoints ?? 0;
  const activeTimerSeconds =
    effectiveStatus?.timerSeconds ?? sharedOnlineSession?.timerSeconds ?? settings.timerSeconds;
  const activeEndReason = effectiveStatus?.endReason ?? sharedOnlineSession?.endReason ?? null;
  const activePlayerName =
    effectiveStatus?.playerName || sharedOnlineSession?.playerName || `لاعب ${activeTeam.name}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1B1F1C]/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`ولا كلمة: ${contentMeta.label}`}
      dir="rtl"
    >
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-3xl overflow-hidden max-w-xl w-full max-h-[94dvh] flex flex-col shadow-2xl">
        {/* Top Modal Header */}
        <div className="bg-[#1B1F1C] text-white px-3.5 sm:px-6 py-3 sm:py-4 flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-bold">
              <span
                className="px-2.5 py-1 rounded-lg text-white inline-flex items-center gap-1.5 shadow-xs"
                style={{ backgroundColor: activeTeam.color || '#14543D' }}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{activeTeam.name}</span>
              </span>
              <span className="text-[#F07842]">ولا كلمة · تمثيل صامت (QR)</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-white/10 border border-white/15 text-white font-mono tabular-nums">
                {activeLevelMeta.levelLabel} · {activePointsPerWord} نقطة
              </span>
            </div>
            <h3 className="font-display text-base sm:text-xl font-bold text-white">
              {contentMeta.label}
            </h3>
          </div>

          {(!activeStatusValue || activeStatusValue === 'waiting_scan') && canControl && (
            <button
              type="button"
              onClick={handleCancelAndExit}
              aria-label="إغلاق الجولة"
              className="min-w-[44px] min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm font-bold text-rose-800">
              {errorMsg}
            </div>
          )}

          {/* PHASE 1: ACTOR SELECTION BEFORE GENERATING QR */}
          {!activeStatusValue && canControl && (
            <div className="space-y-5">
              <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#1B1F1C]">
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
                          className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-all cursor-pointer truncate ${
                            isSelected
                              ? 'bg-[#1B1F1C] border-[#1B1F1C] text-white shadow-sm'
                              : 'bg-white border-[#E5E8DD] text-[#1B1F1C] hover:border-[#F07842]'
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
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#E5E8DD] bg-white text-sm font-semibold text-[#1B1F1C] focus:outline-none focus:border-[#F07842]"
                  />
                </div>
              </div>

              {/* Round Parameters Summary */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-2xl bg-[#F7F8F1] border border-[#E5E8DD] p-3">
                  <div className="text-[11px] font-bold text-[#52574E]">مدة التمثيل</div>
                  <div className="font-mono text-lg font-extrabold text-[#1B1F1C] tabular-nums mt-0.5">
                    {settings.timerSeconds} ث
                  </div>
                </div>
                <div className="rounded-2xl bg-[#FEF2EC] border border-[#F07842]/25 p-3">
                  <div className="text-[11px] font-bold text-[#52574E]">التخطي المتاح</div>
                  <div className="font-mono text-lg font-extrabold text-[#F07842] tabular-nums mt-0.5">
                    {settings.maxSkips ?? 3}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#EAF2EE] border border-[#14543D]/20 p-3">
                  <div className="text-[11px] font-bold text-[#52574E]">
                    نقاط {selectedLevelMeta.levelLabel}
                  </div>
                  <div className="font-mono text-lg font-extrabold text-[#14543D] tabular-nums mt-0.5">
                    +{selectedPoints}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={creating}
                  onClick={handleStartRoundAndGenerateQr}
                  className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all disabled:opacity-60"
                >
                  <QrCode className="w-5 h-5" />
                  <span>{creating ? 'جاري تجهيز الرمز...' : 'إظهار رمز QR للممثل'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelAndExit}
                  className="min-h-[48px] px-5 py-3 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C] font-bold text-sm cursor-pointer transition-colors"
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
              <p className="text-sm font-bold text-[#1B1F1C]">
                يقوم المضيف باختيار الممثل وتجهيز رمز QR لجولة «ولا كلمة»...
              </p>
            </div>
          )}

          {/* PHASE 2A: WAITING FOR QR SCAN */}
          {activeStatusValue === 'waiting_scan' && (
            <div className="space-y-4 text-center">
              <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-2xl p-5 flex flex-col items-center gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-[#52574E]">
                    الدور للممثل:{' '}
                    <span className="text-[#F07842]">{activePlayerName}</span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-[#1B1F1C]">
                    امسح رمز QR بكاميرا جوالك لتظهر الكلمة السرية ويبدأ مؤقت الـ {activeTimerSeconds} ثانية
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4">
                  <div className="bg-white p-3 rounded-2xl border border-[#E5E8DD] shadow-sm">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="رمز QR لجولة ولا كلمة"
                        className="w-44 h-44 sm:w-56 sm:h-56 object-contain"
                      />
                    ) : (
                      <div className="w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center text-xs text-[#666B62]">
                        جاري توليد رمز QR...
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-[#E5E8DD] rounded-2xl p-4 flex flex-col items-center gap-2 min-w-[144px] shadow-xs">
                    <CircularCountdownTimer
                      totalSeconds={activeTimerSeconds}
                      remainingSeconds={activeTimerSeconds}
                      isActive={false}
                      size={96}
                      strokeWidth={8}
                      variant="light"
                    />
                    <span className="text-[11px] font-bold text-[#14543D]">
                      يبدأ فور مسح الرمز
                    </span>
                  </div>
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
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] text-xs font-bold text-[#52574E] hover:text-[#1B1F1C] cursor-pointer transition-colors"
                >
                  إلغاء الجولة والعودة للوحة
                </button>
              )}
            </div>
          )}

          {/* PHASE 2B: ACTIVE CHARADES ROUND (SECRET WORD NEVER EXPOSED HERE) */}
          {activeStatusValue === 'active' && (
            <div className="space-y-4 sm:space-y-5">
              <div className="rounded-2xl bg-gradient-to-br from-[#1B1F1C] via-[#1B2620] to-[#14543D] text-white p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-white/85">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#F07842] shrink-0" />
                    <span>الكلمة السرية على جوال {activePlayerName} فقط</span>
                  </div>
                  <span className="text-[#86EFAC]">المؤقت متزامن مع جوال الممثل</span>
                </div>

                {/* Animated Circular Countdown Timer Centerpiece */}
                <div className="flex flex-col items-center justify-center gap-3 py-1">
                  <CircularCountdownTimer
                    totalSeconds={activeTimerSeconds}
                    remainingSeconds={effectiveStatus?.remainingSeconds ?? activeTimerSeconds}
                    expiresAt={syncedExpiresAt}
                    clockOffsetMs={clockOffsetMs}
                    isActive={true}
                    onReachZero={() => {
                      if (canControl) {
                        void syncHostNow();
                      }
                    }}
                    size={136}
                    strokeWidth={10}
                    variant="dark"
                    connectionWarning={streamWarning}
                  />

                  <div className="text-center space-y-1">
                    <div className="font-display text-lg sm:text-xl font-bold text-white">
                      خمّن الكلمة من حركات {activePlayerName}!
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-white/80">
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
                  <div className="rounded-xl bg-white/10 border border-white/15 p-3">
                    <div className="text-[11px] text-white/75 font-semibold">حالة الجولة</div>
                    <div className="font-sans text-sm sm:text-base font-bold text-[#86EFAC] mt-1">
                      جارية الآن
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/10 border border-white/15 p-3">
                    <div className="text-[11px] text-white/75 font-semibold">تخطي</div>
                    <div className="font-mono text-xl font-bold text-[#FDE68A] tabular-nums mt-0.5">
                      {activeSkippedCount} / {activeMaxSkips}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/10 border border-white/15 p-3">
                    <div className="text-[11px] text-white/75 font-semibold">جائزة الجولة</div>
                    <div className="font-mono text-xl font-bold text-[#F07842] tabular-nums mt-0.5">
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
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#86EFAC] shrink-0" />
                    <span>تم التخمين الصحيح (+{activePointsPerWord})</span>
                  </button>

                  <button
                    type="button"
                    disabled={hostBusy}
                    onClick={() => void handleHostAction('finish')}
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-sm cursor-pointer transition-colors disabled:opacity-60"
                  >
                    إنهاء الجولة (0 نقطة)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PHASE 3: ROUND FINISHED -> UNIFIED "مين جاوب صح؟" WINNER SELECTION */}
          {(activeStatusValue === 'finished' || activeStatusValue === 'expired') && (
            <div className="space-y-4 sm:space-y-5">
              <div className="rounded-2xl bg-[#F7F8F1] border border-[#E5E8DD] p-5 sm:p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#1B1F1C] text-white flex items-center justify-center mx-auto shadow-sm">
                  {activeEarnedPoints > 0 ? (
                    <Trophy className="w-7 h-7 text-[#FDE68A]" />
                  ) : activeEndReason === 'time_up' ? (
                    <Clock className="w-7 h-7 text-[#F07842]" />
                  ) : (
                    <Sparkles className="w-7 h-7 text-[#F07842]" />
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="font-display text-xl sm:text-2xl font-bold text-[#1B1F1C]">
                    {activeEarnedPoints > 0
                      ? 'تم تخمين الكلمة! انتهت الجولة'
                      : activeEndReason === 'time_up'
                      ? 'انتهى الوقت!'
                      : 'انتهت جولة التمثيل'}
                  </h4>
                  <p className="text-xs sm:text-sm font-semibold text-[#52574E]">
                    فريق {activeTeam.name} · الممثل {activePlayerName}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-white rounded-xl border border-[#E5E8DD] p-3">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#14543D]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>الحالة</span>
                    </div>
                    <div className="font-sans text-sm sm:text-base font-bold text-[#1B1F1C] mt-1.5">
                      {activeCorrectCount > 0 ? 'تخمين صحيح' : 'لم يُخمن'}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-[#E5E8DD] p-3">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#52574E]">
                      <SkipForward className="w-3.5 h-3.5" />
                      <span>تخطي</span>
                    </div>
                    <div className="font-mono text-2xl font-extrabold text-[#1B1F1C] tabular-nums mt-1">
                      {activeSkippedCount}
                    </div>
                  </div>
                  <div className="bg-[#FEF2EC] rounded-xl border border-[#F07842]/30 p-3">
                    <div className="text-[11px] font-bold text-[#D9602B]">نقاط المستوى</div>
                    <div className="font-mono text-2xl font-extrabold text-[#F07842] tabular-nums mt-1">
                      {activePointsPerWord}
                    </div>
                  </div>
                </div>
              </div>

              {canControl ? (
                <WhoAnsweredCorrectlyPanel
                  teams={resolvedTeams}
                  points={activePointsPerWord}
                  disabled={committing}
                  pendingChoice={pendingCommitChoice}
                  highlightNoTeam={activeEarnedPoints === 0}
                  subtitle={
                    activeEarnedPoints > 0
                      ? `أكّد الفريق الفائز لمنحه +${activePointsPerWord} نقطة كاملة، أو اختر «ولا فريق».`
                      : activeEndReason === 'time_up'
                      ? 'انتهى الوقت دون تخمين! اختر «ولا فريق» لعدم إضافة نقاط، أو حدّد الفريق الفائز.'
                      : 'حدّد الفريق الفائز بنقاط المستوى أو اختر «ولا فريق» (0 نقطة).'
                  }
                  onSelectTeam={(teamIdx) => void handleCommitDecision(teamIdx)}
                  onSelectNoTeam={() => void handleCommitDecision(null)}
                />
              ) : (
                <div className="text-center text-xs font-bold text-[#52574E] py-2">
                  بانتظار المضيف لتحديد «مين جاوب صح؟» واعتماد النتيجة...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
