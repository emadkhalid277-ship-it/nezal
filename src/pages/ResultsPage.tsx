import React from 'react';
import { Trophy, RotateCcw, Users, Home } from 'lucide-react';
import { TeamConfig } from '../types/game';

interface ResultsPageProps {
  teams: TeamConfig[];
  usedCount: number;
  onPlayAgainSameTeams: () => void;
  onEditTeamsNewGame: () => void;
  onBackHome: () => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({
  teams,
  usedCount,
  onPlayAgainSameTeams,
  onEditTeamsNewGame,
  onBackHome,
}) => {
  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);
  const topScore = sortedTeams[0]?.score ?? 0;
  const winners = sortedTeams.filter((t) => t.score === topScore);
  const isTie = winners.length > 1 && topScore > 0;

  // Compute true competition rank so tied teams share the same rank number (e.g., both #1)
  const teamRanks: number[] = [];
  sortedTeams.forEach((team, idx) => {
    if (idx === 0) {
      teamRanks.push(1);
    } else if (team.score === sortedTeams[idx - 1].score) {
      teamRanks.push(teamRanks[idx - 1]);
    } else {
      teamRanks.push(idx + 1);
    }
  });

  return (
    <div className="max-w-[1040px] mx-auto px-6 py-12 md:py-16 space-y-10">
      {/* Winner Banner */}
      <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-2xl p-8 md:p-12 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center justify-center mx-auto">
          <Trophy className="w-9 h-9 text-[#F07842]" />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-[#14543D]">
            انتهت الجولة · تم لعب {usedCount} سؤال
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-[#252824]">
            {topScore === 0
              ? 'انتهت الجولة بدون نقاط مسجلة'
              : isTie
              ? `تعادل قوي على الصدارة بين ${winners
                  .map((w, i) => w.name?.trim() || `الفريق ${i + 1}`)
                  .join(' و ')}!`
              : `كفو! الفائز بالتحدي هو «${winners[0]?.name?.trim() || 'الفريق الأول'}»`}
          </h1>
          <p className="text-sm text-[#777B73]">
            {topScore > 0 && (
              <>
                {isTie ? 'تقاسموا الصدارة برصيد ' : 'حسموا الصدارة برصيد '}
                <strong className="font-mono tabular-nums text-[#F07842]">
                  {topScore}
                </strong>{' '}
                نقطة!
              </>
            )}
          </p>
        </div>

        {/* Final Rankings List */}
        <div className="max-w-2xl mx-auto pt-4 space-y-3 text-right">
          {sortedTeams.map((team, index) => {
            const isWinner = team.score === topScore && topScore > 0;
            const rankNumber = teamRanks[index] ?? index + 1;
            const displayTeamName =
              team.name?.trim() || `الفريق ${index + 1}`;

            return (
              <div
                key={team.id}
                className={`p-5 rounded-xl border-2 flex items-center justify-between gap-4 ${
                  isWinner
                    ? 'bg-[#F3F5E9] border-[#14543D]'
                    : 'bg-[#FFFFFF] border-[#E5E8DD]'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-mono tabular-nums text-base font-bold text-white shrink-0"
                    style={{ backgroundColor: team.color }}
                  >
                    #{rankNumber}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-bold text-[#252824] truncate">
                        {displayTeamName}
                      </span>
                      {isWinner && (
                        <span className="text-xs font-bold text-[#F07842] shrink-0">
                          {isTie ? '★ متصدر مشترك' : '★ المتصدر'}
                        </span>
                      )}
                    </div>
                    {team.players.length > 0 && (
                      <div className="text-xs text-[#777B73] truncate">
                        اللاعبون: {team.players.join(' · ')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-left shrink-0">
                  <div
                    className="font-mono tabular-nums text-2xl md:text-3xl font-bold"
                    style={{ color: team.color }}
                  >
                    {team.score}
                  </div>
                  <div className="text-xs text-[#777B73]">نقطة</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="pt-6 border-t border-[#E5E8DD] flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={onPlayAgainSameTeams}
            className="px-7 py-3.5 text-sm font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>تحدي جديد بنفس الفرق</span>
          </button>

          <button
            type="button"
            onClick={onEditTeamsNewGame}
            className="px-6 py-3.5 text-sm font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>تعديل الفرق وتحدي جديد</span>
          </button>

          <button
            type="button"
            onClick={onBackHome}
            className="px-5 py-3.5 text-sm font-semibold text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>الرئيسية</span>
          </button>
        </div>
      </div>
    </div>
  );
};
