import React from 'react';
import { Play, RotateCcw, Clock } from 'lucide-react';
import { UserGameMatch } from '../types/match';
import { ModalShell, UI_CLASSES } from './ui';

interface ResumeMatchModalProps {
  isOpen: boolean;
  match: UserGameMatch | null;
  onResume: () => void;
  onStartNew: () => void;
  onClose?: () => void;
}

export const ResumeMatchModal: React.FC<ResumeMatchModalProps> = ({
  isOpen,
  match,
  onResume,
  onStartNew,
  onClose,
}) => {
  if (!isOpen || !match) return null;

  // Format date
  let formattedDate = 'مباراة سابقة';
  try {
    if (match.updatedAt?.toDate) {
      formattedDate = match.updatedAt.toDate().toLocaleDateString('ar-SA', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (match.updatedAt) {
      formattedDate = new Date(match.updatedAt).toLocaleDateString('ar-SA', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  } catch {
    // fallback
  }

  const questionsCount = match.usedTileKeys?.length || 0;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="لديك مباراة غير مكتملة!"
      subtitle="هل تريد متابعة مباراتك السابقة أم بدء مباراة جديدة؟"
      icon={<Clock className="w-5 h-5 text-[#F07842]" />}
      headerTone="green"
      maxWidth="md"
      showCloseButton={Boolean(onClose)}
      closeOnBackdrop={Boolean(onClose)}
      closeOnEscape={Boolean(onClose)}
      bodyClassName="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1"
    >
      {/* Match Snapshot Card */}
      <div className="bg-[#F7F8F1] border border-[#E5E8DD] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-2.5 text-xs">
          <span className="font-bold text-[#14543D]">{formattedDate}</span>
          <span className="font-mono tabular-nums font-semibold text-[#52574E]">
            {questionsCount} أسئلة ملعوبة
          </span>
        </div>

        {/* Teams and current scores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {match.teams.map((t) => (
            <div
              key={t.id}
              className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                <span className="text-xs font-bold text-[#1B1F1C] truncate">
                  {t.name}
                </span>
              </div>
              <span className="font-mono tabular-nums text-xs font-bold text-[#14543D] shrink-0">
                {t.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={onResume}
          className={`${UI_CLASSES.btnPrimary} w-full min-h-[48px] text-sm sm:text-base shadow-sm`}
        >
          <Play className="w-4 h-4 fill-current shrink-0" />
          <span>متابعة المباراة</span>
        </button>

        <button
          type="button"
          onClick={onStartNew}
          className={`${UI_CLASSES.btnOutline} w-full min-h-[46px] text-sm`}
        >
          <RotateCcw className="w-4 h-4 text-[#52574E]" />
          <span>لعبة جديدة</span>
        </button>
      </div>
    </ModalShell>
  );
};
