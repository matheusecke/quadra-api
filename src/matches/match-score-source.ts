import { LossType, MatchSide, MatchStatus } from '@prisma/client';

export type MatchScoreSource = 'PERIODS' | 'AWARDED';

export type MatchScoreSourceInput = {
  status: MatchStatus;
  teams: ReadonlyArray<{
    side: MatchSide;
    finalScore: number | null;
    lossType: LossType | null;
  }>;
  periods: ReadonlyArray<{ homePoints: number; awayPoints: number }>;
};

export function deriveMatchScoreSource(
  match: MatchScoreSourceInput,
): MatchScoreSource | null {
  if (match.status !== MatchStatus.FINISHED) return null;
  if (match.teams.some((team) => team.lossType === LossType.FORFEIT)) {
    return 'AWARDED';
  }
  if (match.teams.some((team) => team.lossType === LossType.DEFAULT)) {
    const homeTotal = match.periods.reduce(
      (total, period) => total + period.homePoints,
      0,
    );
    const awayTotal = match.periods.reduce(
      (total, period) => total + period.awayPoints,
      0,
    );
    const home = match.teams.find((team) => team.side === MatchSide.HOME);
    const away = match.teams.find((team) => team.side === MatchSide.AWAY);
    if (home?.finalScore !== homeTotal || away?.finalScore !== awayTotal) {
      return 'AWARDED';
    }
  }
  return 'PERIODS';
}
