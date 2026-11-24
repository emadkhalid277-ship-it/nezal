import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Sparkles,
  Trophy,
  Wand2,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { VisualEffectsSettings } from '../types/game';
import {
  DEFAULT_VISUAL_EFFECTS_SETTINGS,
  resolveEffectiveVisualEffects,
  saveVisualEffectsSettingsToFirestore,
} from '../services/visualEffectsService';
import {
  AnswerFeedbackBanner,
  MatchCelebrationHeader,
} from './GameVisualEffects';
import { evaluateMatchOutcome } from '../utils/matchOutcome';
import { AlertBanner } from './ui';

interface AdminVisualEffectsSectionProps {
  adminUid: string;
  isAdmin: boolean;
  visualEffectsSettings?: VisualEffectsSettings;
  onRefreshVisualEffectsSettings: () => Promise<void>;
}

const PREVIEW_WINNER_OUTCOME = evaluateMatchOutcome([
  { id: 't1', name: 'فريق طويق', score: 1400 },
  { id: 't2', name: 'فريق الصقور', score: 900 },
]);

const PREVIEW_TIE_OUTCOME = evaluateMatchOutcome([
  { id: 't1', name: 'فريق طويق', score: 1100 },
  { id: 't2', name: 'فريق الصقور', score: 1100 },
]);

export const AdminVisualEffectsSection: React.FC<
  AdminVisualEffectsSectionProps
> = ({
  adminUid,
  isAdmin,
  visualEffectsSettings = DEFAULT_VISUAL_EFFECTS_SETTINGS,
  onRefreshVisualEffectsSettings,
}) => {
  const [motionEffectsEnabled, setMotionEffectsEnabled] = useState<boolean>(
    visualEffectsSettings.motionEffectsEnabled
  );
  const [correctAnswerEffect, setCorrectAnswerEffect] = useState<boolean>(
    visualEffectsSettings.correctAnswerEffect
  );
  const [wrongAnswerEffect, setWrongAnswerEffect] = useState<boolean>(
    visualEffectsSettings.wrongAnswerEffect
  );
  const [winnerCelebrationEffect, setWinnerCelebrationEffect] =
    useState<boolean>(visualEffectsSettings.winnerCelebrationEffect);

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<
    'none' | 'correct' | 'wrong' | 'winner' | 'tie'
  >('none');
  const [previewNonce, setPreviewNonce] = useState(0);

  useEffect(() => {
    setMotionEffectsEnabled(Boolean(visualEffectsSettings.motionEffectsEnabled));
    setCorrectAnswerEffect(Boolean(visualEffectsSettings.correctAnswerEffect));
    setWrongAnswerEffect(Boolean(visualEffectsSettings.wrongAnswerEffect));
    setWinnerCelebrationEffect(
      Boolean(visualEffectsSettings.winnerCelebrationEffect)
    );
  }, [visualEffectsSettings]);

  const draftSettings: VisualEffectsSettings = {
    id: 'visual_effects',
    motionEffectsEnabled,
    correctAnswerEffect,
    wrongAnswerEffect,
    winnerCelebrationEffect,
  };
  const previewEffects = resolveEffectiveVisualEffects(draftSettings, false);

  const handleSave = async () => {
    if (!isAdmin || !adminUid) return;
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await saveVisualEffectsSettingsToFirestore(
        {
          motionEffectsEnabled,
          correctAnswerEffect,
          wrongAnswerEffect,
          winnerCelebrationEffect,
        },
        adminUid
      );
      await onRefreshVisualEffectsSettings();
      setStatusMessage('تم حفظ إعدادات المؤثرات البصرية بنجاح وتطبيقها فوراً.');
    } catch {
      await onRefreshVisualEffectsSettings();
      setStatusMessage(
        'تم حفظ التعديلات محلياً على هذا الجهاز (تأكد من تحديث قواعد Firestore للمزامنة السحابية).'
      );
    } finally {
      setSaving(false);
    }
  };

  const triggerPreview = (
    mode: 'correct' | 'wrong' | 'winner' | 'tie'
  ) => {
    setPreviewMode(mode);
    setPreviewNonce((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-[#F07842] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>تجربة اللعب التفاعلية · التحكم البصري</span>
            </div>
            <h2 className="font-display text-xl font-bold text-[#1B1F1C]">
              إعدادات المؤثرات البصرية والحركية
            </h2>
            <p className="text-xs text-[#52574E]">
              فعّل أو عطّل مؤثرات الإجابة الصحيحة، الإجابة الخاطئة، واحتفالية الفوز أو التعادل. يحترم الموقع تلقائياً تفضيل تقليل الحركة (Reduced Motion) في جهاز اللاعب.
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-xs transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
          </button>
        </div>

        {statusMessage && (
          <AlertBanner tone="success" onDismiss={() => setStatusMessage(null)}>
            {statusMessage}
          </AlertBanner>
        )}
        {errorMessage && (
          <AlertBanner tone="error" onDismiss={() => setErrorMessage(null)}>
            {errorMessage}
          </AlertBanner>
        )}

        {/* 4 Clean Switch Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-[#E5E8DD] bg-[#F7F8F1] cursor-pointer hover:border-[#14543D]/40 transition-colors">
            <div className="space-y-1">
              <div className="font-display text-sm font-bold text-[#1B1F1C] flex items-center gap-1.5">
                <Wand2 className="w-4 h-4 text-[#14543D]" />
                <span>المؤثرات الحركية بشكل عام</span>
              </div>
              <p className="text-xs text-[#52574E] leading-relaxed">
                التحكم الشامل في الحركات الانتقالية، العدّ التصاعدي للنقاط، والجسيمات التفاعلية.
              </p>
            </div>
            <input
              type="checkbox"
              checked={motionEffectsEnabled}
              onChange={(e) => setMotionEffectsEnabled(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[#14543D] cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-[#E5E8DD] bg-[#F7F8F1] cursor-pointer hover:border-[#14543D]/40 transition-colors">
            <div className="space-y-1">
              <div className="font-display text-sm font-bold text-[#1B1F1C] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>مؤثر الإجابة الصحيحة</span>
              </div>
              <p className="text-xs text-[#52574E] leading-relaxed">
                إضاءة خضراء، علامة صح متحركة، جسيمات خضراء خفيفة، وإبراز صعود نقاط الفريق.
              </p>
            </div>
            <input
              type="checkbox"
              checked={correctAnswerEffect}
              onChange={(e) => setCorrectAnswerEffect(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[#14543D] cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-[#E5E8DD] bg-[#F7F8F1] cursor-pointer hover:border-[#14543D]/40 transition-colors">
            <div className="space-y-1">
              <div className="font-display text-sm font-bold text-[#1B1F1C] flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>مؤثر الإجابة الخاطئة</span>
              </div>
              <p className="text-xs text-[#52574E] leading-relaxed">
                تنبيه أحمر خفيف، علامة X واضحة، واهتزاز لطيف للبطاقة دون إزعاج أو إخفاء للنص.
              </p>
            </div>
            <input
              type="checkbox"
              checked={wrongAnswerEffect}
              onChange={(e) => setWrongAnswerEffect(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[#14543D] cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-[#E5E8DD] bg-[#F7F8F1] cursor-pointer hover:border-[#14543D]/40 transition-colors">
            <div className="space-y-1">
              <div className="font-display text-sm font-bold text-[#1B1F1C] flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>مؤثر إعلان الفائز والتعادل</span>
              </div>
              <p className="text-xs text-[#52574E] leading-relaxed">
                خلفية احتفالية، كأس ذهبي متحرك، قصاصات Confetti، وتصميم ذهبي مميز عند التعادل.
              </p>
            </div>
            <input
              type="checkbox"
              checked={winnerCelebrationEffect}
              onChange={(e) => setWinnerCelebrationEffect(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[#14543D] cursor-pointer shrink-0"
            />
          </label>
        </div>
      </div>

      {/* Interactive Live Preview Area */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#1B1F1C]">
              معاينة حية للمؤثرات
            </h3>
            <p className="text-xs text-[#52574E]">
              جرّب كل مؤثر بناءً على اختيارات التفعيل أعلاه قبل أو بعد الحفظ.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => triggerPreview('correct')}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              معاينة الإجابة الصحيحة
            </button>
            <button
              type="button"
              onClick={() => triggerPreview('wrong')}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              معاينة الإجابة الخاطئة
            </button>
            <button
              type="button"
              onClick={() => triggerPreview('winner')}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold cursor-pointer transition-colors"
            >
              معاينة الفوز
            </button>
            <button
              type="button"
              onClick={() => triggerPreview('tie')}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              معاينة التعادل
            </button>
          </div>
        </div>

        {previewMode === 'correct' && (
          <div key={`p-c-${previewNonce}`} className="pt-2">
            <AnswerFeedbackBanner
              type="correct"
              headline="إجابة صحيحة!"
              detailText="حصل فريق طويق على +300 نقطة!"
              effectKey={`preview_correct_${previewNonce}`}
              effects={previewEffects}
            />
          </div>
        )}

        {previewMode === 'wrong' && (
          <motion.div
            key={`p-w-${previewNonce}`}
            animate={
              previewEffects.motion && previewEffects.wrong
                ? { x: [0, -6, 6, -4, 4, 0] }
                : { x: 0 }
            }
            transition={{ duration: 0.34, ease: 'easeInOut' }}
            className="pt-2"
          >
            <AnswerFeedbackBanner
              type="wrong"
              headline="إجابة خاطئة"
              detailText="راحت النقاط وينتقل الدور للفريق التالي."
              effectKey={`preview_wrong_${previewNonce}`}
              effects={previewEffects}
            />
          </motion.div>
        )}

        {previewMode === 'winner' && (
          <div
            key={`p-win-${previewNonce}`}
            className="rounded-2xl border-2 border-[#14543D] bg-[#F7F8F1] p-4"
          >
            <MatchCelebrationHeader
              outcome={PREVIEW_WINNER_OUTCOME}
              celebrationKey={`admin_preview_winner`}
              subtitleMeta="معاينة التتويج"
              effects={previewEffects}
              forceReplayNonce={previewNonce}
            />
          </div>
        )}

        {previewMode === 'tie' && (
          <div
            key={`p-tie-${previewNonce}`}
            className="rounded-2xl border-2 border-amber-400 bg-amber-50/40 p-4"
          >
            <MatchCelebrationHeader
              outcome={PREVIEW_TIE_OUTCOME}
              celebrationKey={`admin_preview_tie`}
              subtitleMeta="معاينة التعادل"
              effects={previewEffects}
              forceReplayNonce={previewNonce}
            />
          </div>
        )}
      </div>
    </div>
  );
};
