import { Injectable } from '@nestjs/common';

import { StatisticsResponseDto } from './dto/statistics-response.dto';

export const STATISTIC_METRICS = [
  'minutesSeconds',
  'pts',
  'reb',
  'ast',
  'stl',
  'blk',
  'tov',
  'pf',
  'fgm',
  'fga',
  'threeFgm',
  'threeFga',
  'ftm',
  'fta',
] as const;
export type StatisticMetric = (typeof STATISTIC_METRICS)[number];
export type StatisticLine = Record<StatisticMetric, number | null>;
export type DerivedStatistic = {
  fgPct: number | null;
  threeFgPct: number | null;
  ftPct: number | null;
  trueShootingPct: number | null;
  efficiency: number | null;
};
export type LeaderEntry = {
  athleteId: number;
  athleteName: string;
  tournamentTeamId: number;
  teamId: number;
  teamName: string;
  value: number;
  gamesPlayed: number;
};
export type LeaderCandidateInput = Omit<
  LeaderEntry,
  'value' | 'gamesPlayed'
> & {
  tournamentRosterId: number;
  statistics: readonly StatisticLine[];
};
export type StatisticsLeaders = {
  perGame: Record<'ppg' | 'rpg' | 'apg' | 'stg' | 'bpg', LeaderEntry[]>;
  totals: Record<'pts' | 'reb' | 'ast' | 'stl' | 'blk', LeaderEntry[]>;
};

const EFF_METRICS = [
  'pts',
  'reb',
  'ast',
  'stl',
  'blk',
  'fga',
  'fgm',
  'fta',
  'ftm',
  'tov',
] as const;
const round = (value: number): number => Math.round(value * 1000) / 1000;
const emptyRecord = <T>(value: T): Record<StatisticMetric, T> =>
  Object.fromEntries(
    STATISTIC_METRICS.map((metric) => [metric, value]),
  ) as Record<StatisticMetric, T>;

@Injectable()
export class StatisticsService {
  aggregate(lines: readonly StatisticLine[]): StatisticsResponseDto {
    const measuredGames = emptyRecord(0);
    const totals = emptyRecord<number | null>(null);
    const perGame = emptyRecord<number | null>(null);
    for (const metric of STATISTIC_METRICS) {
      const values = lines
        .map((line) => line[metric])
        .filter((value): value is number => value !== null);
      measuredGames[metric] = values.length;
      if (values.length === 0) continue;
      totals[metric] = values.reduce((sum, value) => sum + value, 0);
      perGame[metric] = round(totals[metric] / values.length);
    }
    const efficiencies = lines
      .map((line) => this.efficiency(line))
      .filter((value): value is number => value !== null);
    const efficiencyTotal =
      efficiencies.length === 0
        ? null
        : efficiencies.reduce((sum, value) => sum + value, 0);
    return {
      gamesPlayed: lines.length,
      measuredGames,
      totals,
      perGame,
      shooting: {
        fgPct: this.percentage(totals.fgm, totals.fga),
        threeFgPct: this.percentage(totals.threeFgm, totals.threeFga),
        ftPct: this.percentage(totals.ftm, totals.fta),
        trueShootingPct: this.trueShooting(totals.pts, totals.fga, totals.fta),
      },
      efficiency: {
        measuredGames: efficiencies.length,
        total: efficiencyTotal,
        perGame:
          efficiencyTotal === null
            ? null
            : round(efficiencyTotal / efficiencies.length),
      },
    };
  }

  derive(line: StatisticLine): DerivedStatistic {
    return {
      fgPct: this.percentage(line.fgm, line.fga),
      threeFgPct: this.percentage(line.threeFgm, line.threeFga),
      ftPct: this.percentage(line.ftm, line.fta),
      trueShootingPct: this.trueShooting(line.pts, line.fga, line.fta),
      efficiency: this.efficiency(line),
    };
  }

  rankLeaders(candidates: readonly LeaderCandidateInput[]): StatisticsLeaders {
    const rows = candidates.map((candidate) => ({
      candidate,
      aggregate: this.aggregate(candidate.statistics),
    }));
    const rank = (
      metric: 'pts' | 'reb' | 'ast' | 'stl' | 'blk',
      mode: 'perGame' | 'totals',
    ): LeaderEntry[] =>
      rows
        .flatMap(({ candidate, aggregate }) => {
          const value = aggregate[mode][metric];
          const gamesPlayed = aggregate.measuredGames[metric];
          return value === null || gamesPlayed === 0
            ? []
            : [
                {
                  athleteId: candidate.athleteId,
                  athleteName: candidate.athleteName,
                  tournamentTeamId: candidate.tournamentTeamId,
                  teamId: candidate.teamId,
                  teamName: candidate.teamName,
                  value,
                  gamesPlayed,
                },
              ];
        })
        .sort(
          (left, right) =>
            right.value - left.value ||
            right.gamesPlayed - left.gamesPlayed ||
            left.athleteName.localeCompare(right.athleteName) ||
            left.athleteId - right.athleteId,
        )
        .slice(0, 5);
    return {
      perGame: {
        ppg: rank('pts', 'perGame'),
        rpg: rank('reb', 'perGame'),
        apg: rank('ast', 'perGame'),
        stg: rank('stl', 'perGame'),
        bpg: rank('blk', 'perGame'),
      },
      totals: {
        pts: rank('pts', 'totals'),
        reb: rank('reb', 'totals'),
        ast: rank('ast', 'totals'),
        stl: rank('stl', 'totals'),
        blk: rank('blk', 'totals'),
      },
    };
  }

  private percentage(
    made: number | null,
    attempted: number | null,
  ): number | null {
    return made === null || attempted === null || attempted === 0
      ? null
      : round(made / attempted);
  }

  private trueShooting(
    points: number | null,
    fieldGoalAttempts: number | null,
    freeThrowAttempts: number | null,
  ): number | null {
    if (
      points === null ||
      fieldGoalAttempts === null ||
      freeThrowAttempts === null
    )
      return null;
    const denominator = 2 * (fieldGoalAttempts + 0.44 * freeThrowAttempts);
    return denominator === 0 ? null : round(points / denominator);
  }

  private efficiency(line: StatisticLine): number | null {
    if (EFF_METRICS.some((metric) => line[metric] === null)) return null;
    return (
      line.pts! +
      line.reb! +
      line.ast! +
      line.stl! +
      line.blk! -
      (line.fga! - line.fgm!) -
      (line.fta! - line.ftm!) -
      line.tov!
    );
  }
}
