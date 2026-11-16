import React from 'react';
import { motion } from 'motion/react';
import { RotateCcw, Users, Home } from 'lucide-react';
import { TeamConfig, VisualEffectsSettings } from '../types/game';
import { evaluateMatchOutcome } from '../utils/matchOutcome';
import {
  AnimatedScoreCounter,
  MatchCelebrationHeader,
  useEffectiveVisualEffects,
} from '../components/GameVisualEffects';

interface ResultsPageProps {
  teams: TeamConfig[];
  usedCount: number;
  celebrationKey?: string;
  visualEffectsSettings?: VisualEffectsSettings;
  onPlayAgainSameTeams: () => void;
  onEditTeamsNewGame: () => void;
  onBackHome: () => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({
  teams,
  usedCount,
  celebrationKey,
  visualEffectsSettings,
  onPlayAgainSameTeams,
  onEditTeamsNewGame,
  onBackHome,
}) => {
  const effects = useEffectiveVisualEffects(visualEffectsSettings);
  const outcome = evaluateMatchOutcome(teams);
  const resolvedCelebrationKey =
    celebrationKey ||
    `local_${usedCount}_${outcome.sortedTeams
      .map((t) => `${t.id}:${t.score}`)
      .join('_')}`;

  return (
    <motion.div
      initial={effects.motion ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-[1040px] mx-auto px-3 sm:px-6 py-6 md:py-16 space-y-6 md:space-y-10"
    >
      {/* Winner / Tie Celebration Card */}
      <div
        className={`relative overflow-hidden bg-[#FFFFFF] rounded-2xl p-4 sm:p-8 md:p-12 text-center space-y-5 sm:space-y-6 shadow-xl border-2 ${
          outcome.isTie
            ? 'border-amber-400'
            : outcome.isZeroScore
            ? 'border-[#E5E8DD]'
            : 'border-[#14543D]'
        }`}
      >
        <MatchCelebrationHeader
          outcome={outcome}
          celebrationKey={resolvedCelebrationKey}
          subtitleMeta={`تم لعب ${usedCount} سؤال`}
          effects={effects}
        />

        {/* Final Rankings List */}
        <div className="max-w-2xl mx-auto pt-2 sm:pt-4 space-y-3 text-right">
          {outcome.sortedTeams.map((team, index) => {
            const isWinner =
              team.score === outcome.topScore && outcome.topScore > 0;
            const rankNumber = outcome.teamRanks[index] ?? index + 1;
            const displayTeamName =
              team.name?.trim() || `الفريق ${index + 1}`;

            return (
              <motion.div
                key={team.id}
                initial={
                  effects.motion && effects.winner
                    ? { opacity: 0, y: 10 }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.28,
                  delay: effects.motion ? Math.min(index * 0.08, 0.32) : 0,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={`p-4 sm:p-5 rounded-xl border-2 flex items-center justify-between gap-3 sm:gap-4 ${
                  isWinner
                    ? outcome.isTie
                      ? 'bg-amber-50/70 border-amber-400 shadow-xs'
                      : 'bg-[#F3F5E9] border-[#14543D] shadow-xs'
                    : 'bg-[#FFFFFF] border-[#E5E8DD]'
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-mono tabular-nums text-base font-bold text-white shrink-0"
                    style={{ backgroundColor: team.color }}
                  >
                    #{rankNumber}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display text-base sm:text-lg font-bold text-[#252824] truncate">
                        {displayTeamName}
                      </span>
                      {isWinner && (
                        <span
                          className={`text-xs font-bold shrink-0 ${
                            outcome.isTie ? 'text-amber-700' : 'text-[#F07842]'
                          }`}
                        >
                          {outcome.isTie ? '★ متصدر مشترك' : '★ الفائز'}
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
                  <AnimatedScoreCounter
                    value={team.score}
                    animateOnMount
                    motionEnabled={effects.motion && effects.winner}
                    durationMs={620}
                    className="font-mono text-2xl md:text-3xl font-bold"
                    style={{ color: team.color }}
                  />
                  <div className="text-xs text-[#777B73]">نقطة</div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="pt-5 border-t border-[#E5E8DD] flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onPlayAgainSameTeams}
            className="w-full sm:w-auto min-h-[48px] px-7 py-3.5 text-sm font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>تحدي جديد بنفس الفرق</span>
          </button>

          <button
            type="button"
            onClick={onEditTeamsNewGame}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 text-sm font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>تعديل الفرق وتحدي جديد</span>
          </button>

          <button
            type="button"
            onClick={onBackHome}
            className="w-full sm:w-auto min-h-[46px] px-5 py-3.5 text-sm font-semibold text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>الرئيسية</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
