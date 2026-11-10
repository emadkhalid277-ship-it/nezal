import React from 'react';
import { Play, RotateCcw, Clock, Trophy, AlertCircle, X, Users } from 'lucide-react';
import { UserGameMatch } from '../types/match';

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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-6 shadow-2xl text-right">
        {/* Header Icon & Title */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/20 text-[#14543D] flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7 text-[#F07842]" />
          </div>
          <h2 className="font-display text-2xl font-bold text-[#252824]">
            لديك مباراة غير مكتملة!
          </h2>
          <p className="text-xs text-[#777B73]">
            هل تريد متابعة مباراتك السابقة أم بدء مباراة جديدة؟
          </p>
        </div>

        {/* Match Snapshot Card */}
        <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-2 text-xs">
            <span className="font-bold text-[#14543D]">{formattedDate}</span>
            <span className="text-[#777B73]">
              {questionsCount} أسئلة ملعوبة
            </span>
          </div>

          {/* Teams and current scores */}
          <div className="grid grid-cols-2 gap-2">
            {match.teams.map((t) => (
              <div
                key={t.id}
                className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-2.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="text-xs font-bold text-[#252824] truncate">
                    {t.name}
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-[#14543D]">
                  {t.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          {/* Primary CTA: Resume */}
          <button
            type="button"
            onClick={onResume}
            className="w-full py-4 rounded-2xl bg-[#14543D] hover:bg-[#0E3D2C] active:scale-[0.99] text-[#FFFFFF] text-base font-bold flex items-center justify-center gap-2.5 shadow-md transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 text-[#F07842]" />
            <span>متابعة المباراة</span>
          </button>

          {/* Secondary CTA: New Game */}
          <button
            type="button"
            onClick={onStartNew}
            className="w-full py-3.5 rounded-2xl bg-[#FFFFFF] hover:bg-[#F3F5E9] border border-[#E5E8DD] text-[#777B73] hover:text-[#252824] text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>لعبة جديدة</span>
          </button>
        </div>
      </div>
    </div>
  );
};
