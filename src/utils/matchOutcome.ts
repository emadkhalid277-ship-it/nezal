export interface MatchOutcomeTeamInput {
  id: string;
  name: string;
  score: number;
  color?: string;
  players?: string[];
}

export type MatchOutcomeStatus = 'winner' | 'tie' | 'zero';

export interface MatchOutcomeResult<T extends MatchOutcomeTeamInput = MatchOutcomeTeamInput> {
  status: MatchOutcomeStatus;
  sortedTeams: T[];
  teamRanks: number[];
  topScore: number;
  winners: T[];
  singleWinner: T | null;
  isTie: boolean;
  isZeroScore: boolean;
  winnerTeamId: string | null;
  winnerTeamName: string;
}

/**
 * Computes deterministic competition standings, rank numbers (sharing rank on ties),
 * and outcome classification ('winner' | 'tie' | 'zero').
 * Never picks an arbitrary winner when teams are tied.
 */
export function evaluateMatchOutcome<T extends MatchOutcomeTeamInput>(
  teams: T[]
): MatchOutcomeResult<T> {
  const sortedTeams = [...teams].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topScore = sortedTeams[0]?.score ?? 0;
  const winners = sortedTeams.filter((t) => (t.score ?? 0) === topScore);

  const teamRanks: number[] = [];
  sortedTeams.forEach((team, idx) => {
    if (idx === 0) {
      teamRanks.push(1);
    } else if ((team.score ?? 0) === (sortedTeams[idx - 1].score ?? 0)) {
      teamRanks.push(teamRanks[idx - 1]);
    } else {
      teamRanks.push(idx + 1);
    }
  });

  const isZeroScore = topScore <= 0;
  const isTie = !isZeroScore && winners.length > 1;
  const singleWinner = !isZeroScore && winners.length === 1 ? winners[0] : null;
  const status: MatchOutcomeStatus = isZeroScore
    ? 'zero'
    : isTie
    ? 'tie'
    : 'winner';

  return {
    status,
    sortedTeams,
    teamRanks,
    topScore,
    winners,
    singleWinner,
    isTie,
    isZeroScore,
    winnerTeamId: singleWinner ? singleWinner.id : null,
    winnerTeamName: singleWinner
      ? singleWinner.name
      : isTie
      ? 'تعادل'
      : '',
  };
}
