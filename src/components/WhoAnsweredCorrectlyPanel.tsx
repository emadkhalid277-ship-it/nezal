import React from 'react';
import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react';

export interface ScoringTeamOption {
  id?: string;
  name: string;
  color: string;
}

interface WhoAnsweredCorrectlyPanelProps {
  teams: ScoringTeamOption[];
  points: number;
  disabled?: boolean;
  pendingChoice?: number | 'none' | null;
  subtitle?: string;
  highlightNoTeam?: boolean;
  onSelectTeam: (teamIndex: number) => void;
  onSelectNoTeam: () => void;
}

export const WhoAnsweredCorrectlyPanel: React.FC<WhoAnsweredCorrectlyPanelProps> = ({
  teams,
  points,
  disabled = false,
  pendingChoice = null,
  subtitle,
  highlightNoTeam = false,
  onSelectTeam,
  onSelectNoTeam,
}) => {
  const safeTeams =
    teams.length > 0
      ? teams
      : [
          { id: 'team_1', name: 'الفريق الأول', color: '#14543D' },
          { id: 'team_2', name: 'الفريق الثاني', color: '#F07842' },
        ];

  return (
    <div
      className="rounded-2xl border border-[#E5E8DD] bg-[#F7F8F1] p-3.5 sm:p-5 space-y-3 sm:space-y-3.5"
      role="region"
      aria-label="مين جاوب صح؟"
      dir="rtl"
    >
      <div className="text-center space-y-1">
        <div className="inline-flex items-center justify-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#F07842] shrink-0" />
          <h4 className="font-display text-base sm:text-xl font-bold text-[#1B1F1C]">
            مين جاوب صح؟
          </h4>
        </div>
        <p className="text-xs font-medium text-[#52574E] leading-relaxed">
          {subtitle ||
            `اختر الفريق الفائز لإضافة +${points} نقطة لرصيده فقط، أو اختر «ولا فريق» للانتقال بدون نقاط.`}
        </p>
      </div>

      <div
        className={`grid gap-2.5 ${
          safeTeams.length >= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {safeTeams.map((team, idx) => {
          const displayName = team.name?.trim() || `الفريق ${idx + 1}`;
          const isPending = pendingChoice === idx;
          return (
            <button
              key={team.id || `team_${idx}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelectTeam(idx)}
              style={{ backgroundColor: team.color || '#14543D' }}
              className="min-h-[52px] px-4 py-3 rounded-xl text-white font-bold text-sm sm:text-base flex items-center justify-between gap-2.5 shadow-sm hover:brightness-105 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <span className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
                <span className="truncate font-display drop-shadow-xs">
                  {isPending ? `جاري احتساب نقاط ${displayName}...` : displayName}
                </span>
              </span>
              <span className="font-mono text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-[#1B1F1C]/25 text-white shrink-0 tabular-nums">
                +{points} نقطة
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onSelectNoTeam}
        className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${
          highlightNoTeam
            ? 'bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800'
            : 'bg-[#FFFFFF] hover:bg-[#F3F5E9] border border-[#E5E8DD] hover:border-[#1B1F1C]/25 text-[#52574E] hover:text-[#1B1F1C]'
        }`}
      >
        <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
        <span>
          {pendingChoice === 'none'
            ? 'جاري التسجيل بدون نقاط...'
            : 'ولا فريق (0 نقطة — انتقال للدور التالي)'}
        </span>
      </button>
    </div>
  );
};
