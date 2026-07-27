import { LossType, MatchResult } from '@prisma/client';

export type RankingTeam = {
  tournamentTeamId: number;
  teamId: number;
  teamName: string;
  tiebreakOrder: number | null;
  tiebreakBlockKey: string | null;
};

export type RankingSide = {
  tournamentTeamId: number;
  finalScore: number;
  result: MatchResult;
  lossType: LossType | null;
};

/** One counted match: exactly two sides, both with a recorded result. */
export type RankingMatch = readonly [RankingSide, RankingSide];

export type RankedRow = {
  position: number | null;
  tournamentTeamId: number;
  teamId: number;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  classificationPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  winPct: number | null;
  isTiedUnresolved: boolean;
  tieBlockKey: string | null;
};

type Tally = {
  played: number;
  wins: number;
  losses: number;
  classificationPoints: number;
  pointsFor: number;
  pointsAgainst: number;
};

const emptyTally = (): Tally => ({
  played: 0,
  wins: 0,
  losses: 0,
  classificationPoints: 0,
  pointsFor: 0,
  pointsAgainst: 0,
});

const diff = (tally: Tally): number => tally.pointsFor - tally.pointsAgainst;

// FIBA Appendix D.1.2: 2 for a win, 1 for a loss, 0 for a loss by forfeit.
const sidePoints = (side: RankingSide): number => {
  if (side.result === MatchResult.WIN) return 2;
  return side.lossType === LossType.FORFEIT ? 0 : 1;
};

function accumulate(
  tally: Tally,
  side: RankingSide,
  opponent: RankingSide,
): void {
  tally.played += 1;
  tally.classificationPoints += sidePoints(side);
  tally.pointsFor += side.finalScore;
  tally.pointsAgainst += opponent.finalScore;
  if (side.result === MatchResult.WIN) tally.wins += 1;
  else tally.losses += 1;
}

/** Tallies only the matches whose two sides are both inside `ids`. */
function tally(
  ids: ReadonlySet<number>,
  matches: readonly RankingMatch[],
): Map<number, Tally> {
  const table = new Map<number, Tally>();
  for (const id of ids) table.set(id, emptyTally());
  for (const [home, away] of matches) {
    if (!ids.has(home.tournamentTeamId) || !ids.has(away.tournamentTeamId))
      continue;
    accumulate(table.get(home.tournamentTeamId)!, home, away);
    accumulate(table.get(away.tournamentTeamId)!, away, home);
  }
  return table;
}

/** Groups ids by equal value and orders the groups by value, descending. */
function partition(
  ids: readonly number[],
  key: (id: number) => number,
): number[][] {
  const groups = new Map<number, number[]>();
  for (const id of ids) {
    const value = key(id);
    const bucket = groups.get(value);
    if (bucket) bucket.push(id);
    else groups.set(value, [id]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, block]) => block);
}

export function rankTable(
  teams: readonly RankingTeam[],
  matches: readonly RankingMatch[],
): RankedRow[] {
  const byId = new Map(teams.map((team) => [team.tournamentTeamId, team]));
  const ids = new Set(byId.keys());
  const overall = tally(ids, matches);

  const stableOrder = (block: readonly number[]): number[] =>
    [...block].sort(
      (left, right) =>
        byId.get(left)!.teamName.localeCompare(byId.get(right)!.teamName) ||
        left - right,
    );

  const toRow = (
    id: number,
    position: number | null,
    tieBlockKey: string | null,
    isTiedUnresolved: boolean,
  ): RankedRow => {
    const team = byId.get(id)!;
    const stats = overall.get(id)!;
    return {
      position,
      tournamentTeamId: team.tournamentTeamId,
      teamId: team.teamId,
      teamName: team.teamName,
      played: stats.played,
      wins: stats.wins,
      losses: stats.losses,
      classificationPoints: stats.classificationPoints,
      pointsFor: stats.pointsFor,
      pointsAgainst: stats.pointsAgainst,
      pointDiff: diff(stats),
      winPct: stats.played === 0 ? null : stats.wins / stats.played,
      isTiedUnresolved,
      tieBlockKey,
    };
  };

  // An EMPTY table is listed, not ranked: no game has been played yet.
  if (matches.length === 0) {
    return stableOrder([...ids]).map((id) => toRow(id, null, null, false));
  }

  const blockKeys = new Map<number, string>();
  const unresolved = new Set<number>();

  const draw = (tied: readonly number[]): number[] => {
    const key = [...tied].sort((left, right) => left - right).join('-');
    for (const id of tied) {
      blockKeys.set(id, key);
      unresolved.add(id);
    }
    return stableOrder(tied);
  };

  const breakTie = (tied: readonly number[]): number[] => {
    const criteria: ((id: number) => number)[] = [];
    for (const criterion of criteria) {
      const blocks = partition(tied, criterion);
      if (blocks.length === 1) continue;
      // FIBA D.1.4: any split restarts the procedure from criterion 1 per sub-block.
      return blocks.flatMap((block) =>
        block.length === 1 ? block : breakTie(block),
      );
    }
    return draw(tied);
  };

  const ordered = partition(
    [...ids],
    (id) => overall.get(id)!.classificationPoints,
  ).flatMap((block) => (block.length === 1 ? block : breakTie(block)));

  return ordered.map((id, index) =>
    toRow(id, index + 1, blockKeys.get(id) ?? null, unresolved.has(id)),
  );
}
