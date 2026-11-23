import React from 'react';
import { motion, MotionConfig } from 'motion/react';
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
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={effects.motion ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[960px] mx-auto px-3 sm:px-6 py-6 md:py-14 space-y-6"
      >
        {/* Winner / Tie Celebration Card */}
        <div
          className={`relative overflow-hidden bg-[#FFFFFF] rounded-3xl p-4 sm:p-8 md:p-11 text-center space-y-6 shadow-xl border ${
            outcome.isTie
              ? 'border-amber-300'
              : outcome.isZeroScore
              ? 'border-[#E5E8DD]'
              : 'border-[#E5E8DD]'
          }`}
        >
          {/* Subtle Top Accent Bar */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              backgroundColor: outcome.isTie
                ? '#F59E0B'
                : outcome.isZeroScore
                ? '#E5E8DD'
                : outcome.singleWinner?.color || '#F07842',
            }}
          />

          <MatchCelebrationHeader
            outcome={outcome}
            celebrationKey={resolvedCelebrationKey}
            subtitleMeta={`تم لعب ${usedCount} سؤال`}
            effects={effects}
          />

          {/* Final Rankings List */}
          <div className="max-w-2xl mx-auto pt-1 space-y-3 text-right">
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
                  className={`relative overflow-hidden p-4 sm:p-5 rounded-2xl border flex items-center justify-between gap-3 sm:gap-4 transition-shadow ${
                    isWinner
                      ? outcome.isTie
                        ? 'bg-[#FFFBEB] border-amber-300 shadow-sm'
                        : 'bg-[#F7F8F1] border-[#F07842]/50 shadow-sm'
                      : 'bg-[#FFFFFF] border-[#E5E8DD]'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-mono tabular-nums text-base font-extrabold text-white shrink-0 shadow-xs"
                      style={{ backgroundColor: team.color }}
                    >
                      #{rankNumber}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-base sm:text-lg font-bold text-[#1B1F1C] truncate">
                          {displayTeamName}
                        </span>
                        {isWinner && (
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md shrink-0 ${
                              outcome.isTie
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-[#FEF2EC] text-[#F07842]'
                            }`}
                          >
                            {outcome.isTie ? '★ متصدر مشترك' : '★ الفائز'}
                          </span>
                        )}
                      </div>
                      {team.players.length > 0 && (
                        <div className="text-xs text-[#52574E] truncate">
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
                      className="font-mono text-2xl sm:text-3xl font-extrabold"
                      style={{ color: team.color }}
                    />
                    <div className="text-[11px] font-medium text-[#52574E]">
                      نقطة
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-[#E5E8DD] flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3">
            <button
              type="button"
              onClick={onPlayAgainSameTeams}
              className="w-full sm:w-auto min-h-[48px] px-7 py-3.5 text-sm font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span>تحدي جديد بنفس الفرق</span>
            </button>

            <button
              type="button"
              onClick={onEditTeamsNewGame}
              className="w-full sm:w-auto min-h-[48px] px-6 py-3.5 text-sm font-bold text-white bg-[#1B1F1C] hover:bg-[#2F3530] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Users className="w-4 h-4 text-[#F07842]" />
              <span>تعديل الفرق وتحدي جديد</span>
            </button>

            <button
              type="button"
              onClick={onBackHome}
              className="w-full sm:w-auto min-h-[46px] px-5 py-3.5 text-sm font-semibold text-[#1B1F1C] bg-[#F7F8F1] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Home className="w-4 h-4 text-[#52574E]" />
              <span>الرئيسية</span>
            </button>
          </div>
        </div>
      </motion.div>
    </MotionConfig>
  );
};
