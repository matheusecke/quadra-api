import { StatisticsService, type StatisticLine } from './statistics.service';

const line = (overrides: Partial<StatisticLine> = {}): StatisticLine => ({
  minutesSeconds: null,
  pts: null,
  reb: null,
  ast: null,
  stl: null,
  blk: null,
  tov: null,
  pf: null,
  fgm: null,
  fga: null,
  threeFgm: null,
  threeFga: null,
  ftm: null,
  fta: null,
  ...overrides,
});

describe('StatisticsService', () => {
  const service = new StatisticsService();

  it('returns the exact empty aggregate without turning untracked into zero', () => {
    expect(service.aggregate([])).toEqual({
      gamesPlayed: 0,
      measuredGames: Object.fromEntries(
        [
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
        ].map((metric) => [metric, 0]),
      ),
      totals: Object.fromEntries(
        [
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
        ].map((metric) => [metric, null]),
      ),
      perGame: Object.fromEntries(
        [
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
        ].map((metric) => [metric, null]),
      ),
      shooting: {
        fgPct: null,
        threeFgPct: null,
        ftPct: null,
        trueShootingPct: null,
      },
      efficiency: { measuredGames: 0, total: null, perGame: null },
    });
  });

  it('uses metric-specific denominators, preserves measured zero, and rounds to three decimals', () => {
    const result = service.aggregate([
      line({ pts: 10, reb: 0 }),
      line({ pts: 11, reb: null }),
      line({ pts: null, reb: 2 }),
    ]);

    expect(result.gamesPlayed).toBe(3);
    expect(result.measuredGames).toMatchObject({ pts: 2, reb: 2, ast: 0 });
    expect(result.totals).toMatchObject({ pts: 21, reb: 2, ast: null });
    expect(result.perGame).toMatchObject({ pts: 10.5, reb: 1, ast: null });
  });

  it('derives guarded shooting percentages, confirmed TS%, and per-match EFF', () => {
    const complete = line({
      pts: 24,
      reb: 8,
      ast: 5,
      stl: 2,
      blk: 1,
      tov: 3,
      fgm: 9,
      fga: 17,
      threeFgm: 3,
      threeFga: 7,
      ftm: 3,
      fta: 4,
    });

    expect(service.derive(complete)).toEqual({
      fgPct: 0.529,
      threeFgPct: 0.429,
      ftPct: 0.75,
      trueShootingPct: 0.64,
      efficiency: 28,
    });
    expect(service.derive(line({ fgm: 0, fga: 0 }))).toMatchObject({
      fgPct: null,
      efficiency: null,
    });
    expect(service.aggregate([complete, line({ pts: 3 })]).efficiency).toEqual({
      measuredGames: 1,
      total: 28,
      perGame: 28,
    });
  });

  it('ranks top five per-game and total leaders with category-specific games and stable ties', () => {
    const candidates = [
      {
        athleteName: 'Zulu',
        athleteId: 6,
        statistics: [line({ pts: 20 }), line({ pts: 20 })],
      },
      { athleteName: 'Alpha', athleteId: 5, statistics: [line({ pts: 20 })] },
      {
        athleteName: 'Bravo',
        athleteId: 7,
        statistics: [line({ pts: 20 }), line({ pts: 20 })],
      },
      {
        athleteName: 'Bravo',
        athleteId: 4,
        statistics: [line({ pts: 20 }), line({ pts: 20 })],
      },
      { athleteName: 'Charlie', athleteId: 3, statistics: [line({ pts: 19 })] },
      { athleteName: 'Delta', athleteId: 2, statistics: [line({ pts: 18 })] },
      { athleteName: 'Echo', athleteId: 1, statistics: [line({ pts: 17 })] },
    ].map(({ athleteName, athleteId, statistics }, index) => ({
      athleteId,
      athleteName,
      tournamentRosterId: 100 + index,
      tournamentTeamId: 200 + index,
      teamId: 300 + index,
      teamName: `Team ${index}`,
      statistics,
    }));

    const result = service.rankLeaders(candidates);

    expect(result.perGame.ppg).toHaveLength(5);
    expect(result.perGame.ppg.map(({ athleteId }) => athleteId)).toEqual([
      4, 7, 6, 5, 3,
    ]);
    expect(result.perGame.ppg[0]).toMatchObject({ value: 20, gamesPlayed: 2 });
    expect(result.totals.pts.map(({ athleteId }) => athleteId)).toEqual([
      4, 7, 6, 5, 3,
    ]);
    expect(result.perGame.rpg).toEqual([]);
    expect(result.totals.reb).toEqual([]);
  });
});
