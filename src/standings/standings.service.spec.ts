import { HttpStatus } from '@nestjs/common';
import { expect, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  LossType,
  MatchResult,
  MatchStatus,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { StandingsService } from './standings.service';

type AsyncMock = jest.Mock<(input?: unknown) => Promise<unknown>>;

type MockPrisma = {
  tournament: { findFirst: AsyncMock };
  tournamentTeam: {
    findMany: AsyncMock;
    update: AsyncMock;
    updateMany: AsyncMock;
  };
  tournamentGroup: { findMany: AsyncMock };
  tournamentGroupTeam: { findMany: AsyncMock };
  match: { findMany: AsyncMock };
  $transaction: AsyncMock;
};

const createAsyncMock = (): AsyncMock =>
  jest.fn<(input?: unknown) => Promise<unknown>>();

const mockPrisma: MockPrisma = {
  tournament: { findFirst: createAsyncMock() },
  tournamentTeam: {
    findMany: createAsyncMock(),
    update: createAsyncMock(),
    updateMany: createAsyncMock(),
  },
  tournamentGroup: { findMany: createAsyncMock() },
  tournamentGroupTeam: { findMany: createAsyncMock() },
  match: { findMany: createAsyncMock() },
  $transaction: createAsyncMock(),
};

// Registration row as `standingsTeamSelect` returns it.
const team = (
  id: number,
  displayNameSnapshot: string,
  tiebreak: {
    tiebreakOrder?: number | null;
    tiebreakBlockKey?: string | null;
  } = {},
) => ({
  id,
  teamId: id * 10,
  displayNameSnapshot,
  tiebreakOrder: tiebreak.tiebreakOrder ?? null,
  tiebreakBlockKey: tiebreak.tiebreakBlockKey ?? null,
});

let matchId = 0;

// A finished match. `lossType` applies to whichever side lost.
const finished = (
  homeId: number,
  homeScore: number,
  awayId: number,
  awayScore: number,
  options: { groupId?: number | null; lossType?: LossType } = {},
) => {
  const homeWon = homeScore > awayScore;
  const loss = options.lossType ?? LossType.NORMAL;
  matchId += 1;
  return {
    id: matchId,
    status: MatchStatus.FINISHED,
    tournamentGroupId: options.groupId ?? null,
    teams: [
      {
        tournamentTeamId: homeId,
        finalScore: homeScore,
        result: homeWon ? MatchResult.WIN : MatchResult.LOSS,
        lossType: homeWon ? null : loss,
      },
      {
        tournamentTeamId: awayId,
        finalScore: awayScore,
        result: homeWon ? MatchResult.LOSS : MatchResult.WIN,
        lossType: homeWon ? loss : null,
      },
    ],
  };
};

const unplayed = (
  homeId: number,
  awayId: number,
  status: MatchStatus = MatchStatus.SCHEDULED,
  groupId: number | null = null,
) => {
  matchId += 1;
  return {
    id: matchId,
    status,
    tournamentGroupId: groupId,
    teams: [
      {
        tournamentTeamId: homeId,
        finalScore: null,
        result: null,
        lossType: null,
      },
      {
        tournamentTeamId: awayId,
        finalScore: null,
        result: null,
        lossType: null,
      },
    ],
  };
};

function arrangeLeague(
  teams: ReturnType<typeof team>[],
  matches: unknown[],
  status: TournamentStatus = TournamentStatus.IN_PROGRESS,
): void {
  mockPrisma.tournament.findFirst.mockResolvedValue({
    id: 12,
    status,
    format: TournamentFormat.LEAGUE,
  });
  mockPrisma.tournamentTeam.findMany.mockResolvedValue(teams);
  mockPrisma.match.findMany.mockResolvedValue(matches);
}

function arrangeGroupStage(
  teams: ReturnType<typeof team>[],
  groups: { id: number; name: string }[],
  memberships: { tournamentGroupId: number; tournamentTeamId: number }[],
  matches: unknown[],
  status: TournamentStatus = TournamentStatus.IN_PROGRESS,
): void {
  mockPrisma.tournament.findFirst.mockResolvedValue({
    id: 12,
    status,
    format: TournamentFormat.GROUP_STAGE,
  });
  mockPrisma.tournamentTeam.findMany.mockResolvedValue(teams);
  mockPrisma.tournamentGroup.findMany.mockResolvedValue(groups);
  mockPrisma.tournamentGroupTeam.findMany.mockResolvedValue(memberships);
  mockPrisma.match.findMany.mockResolvedValue(matches);
}

async function captureApiException(
  promise: Promise<unknown>,
): Promise<ApiException> {
  return promise.then(
    () => {
      throw new Error('Expected ApiException');
    },
    (error: unknown) => error as ApiException,
  );
}

function getApiErrorCode(error: ApiException): string {
  const response = error.getResponse();
  if (
    typeof response !== 'object' ||
    response === null ||
    !('error' in response) ||
    typeof response.error !== 'object' ||
    response.error === null ||
    !('code' in response.error) ||
    typeof response.error.code !== 'string'
  ) {
    throw new Error('Expected ApiException error response');
  }
  return response.error.code;
}

describe('StandingsService', () => {
  let service: StandingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    matchId = 0;
    const module = await Test.createTestingModule({
      providers: [
        StandingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(StandingsService);
  });

  it('ranks a league by classification points', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [finished(1, 80, 2, 70), finished(1, 90, 3, 60), finished(2, 85, 3, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([1, 2, 3]);
  });

  it('exposes a league table with no group', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.group).toBeNull();
  });

  it('scores a normal loss as one classification point', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 2)
        ?.classificationPoints,
    ).toBe(1);
  });

  it('scores a loss by forfeit as zero classification points', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [
        finished(1, 20, 2, 0, { lossType: LossType.FORFEIT }),
        finished(3, 80, 2, 70),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 2)
        ?.classificationPoints,
    ).toBe(1);
  });

  it('counts a forfeit loss as a loss even though it scores nothing', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 20, 2, 0, { lossType: LossType.FORFEIT })],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.find((row) => row.tournamentTeamId === 2)?.losses).toBe(
      1,
    );
  });

  it('reports pointDiff as pointsFor minus pointsAgainst', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 1)?.pointDiff,
    ).toBe(10);
  });

  it('reports a null winPct for a team that has not played', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 3)?.winPct,
    ).toBeNull();
  });

  it('skips a finished match whose result is not recorded on both sides', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [{ ...unplayed(1, 2), status: MatchStatus.FINISHED }],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.every((row) => row.played === 0)).toBe(true);
  });

  it('marks a table with no counted match as EMPTY', async () => {
    arrangeLeague([team(1, 'Alpha'), team(2, 'Bravo')], [unplayed(1, 2)]);

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('EMPTY');
  });

  it('leaves every position null while the table is EMPTY', async () => {
    arrangeLeague([team(1, 'Alpha'), team(2, 'Bravo')], [unplayed(1, 2)]);

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.every((row) => row.position === null)).toBe(true);
  });

  it('orders an EMPTY table by team name', async () => {
    arrangeLeague([team(2, 'Zulu'), team(1, 'Alpha')], [unplayed(1, 2)]);

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([1, 2]);
  });

  it('marks a table with a counted and a pending match as PARTIAL', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70), unplayed(1, 2)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('PARTIAL');
  });

  it('marks a fully played table as FINAL', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('FINAL');
  });

  it('counts scheduled, live, and postponed matches as pending', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [
        finished(1, 80, 2, 70),
        unplayed(1, 2, MatchStatus.SCHEDULED),
        unplayed(1, 2, MatchStatus.LIVE),
        unplayed(1, 2, MatchStatus.POSTPONED),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.pendingMatches).toBe(3);
  });

  it('does not hold a table in PARTIAL because of a cancelled match', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70), unplayed(1, 2, MatchStatus.CANCELLED)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('FINAL');
  });

  it('returns 404 for a missing or cross-tenant tournament', async () => {
    mockPrisma.tournament.findFirst.mockResolvedValue(null);

    const error = await captureApiException(service.findStandings(42, 999));

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('returns one table per group in a group stage', async () => {
    arrangeGroupStage(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [
        { id: 7, name: 'Grupo A' },
        { id: 8, name: 'Grupo B' },
      ],
      [
        { tournamentGroupId: 7, tournamentTeamId: 1 },
        { tournamentGroupId: 7, tournamentTeamId: 2 },
        { tournamentGroupId: 8, tournamentTeamId: 3 },
        { tournamentGroupId: 8, tournamentTeamId: 4 },
      ],
      [
        finished(1, 80, 2, 70, { groupId: 7 }),
        finished(3, 90, 4, 60, { groupId: 8 }),
      ],
    );

    const tables = await service.findStandings(42, 12);

    expect(tables.map((table) => table.group?.id)).toEqual([7, 8]);
  });

  it('keeps each group table to its own members', async () => {
    arrangeGroupStage(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [{ id: 7, name: 'Grupo A' }],
      [
        { tournamentGroupId: 7, tournamentTeamId: 1 },
        { tournamentGroupId: 7, tournamentTeamId: 2 },
      ],
      [finished(1, 80, 2, 70, { groupId: 7 })],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([1, 2]);
  });

  it('ignores a match played outside the group', async () => {
    arrangeGroupStage(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [{ id: 7, name: 'Grupo A' }],
      [
        { tournamentGroupId: 7, tournamentTeamId: 1 },
        { tournamentGroupId: 7, tournamentTeamId: 2 },
      ],
      [finished(1, 80, 2, 70, { groupId: null })],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('EMPTY');
  });

  it('ignores a match whose opponent is not in the table', async () => {
    arrangeGroupStage(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [{ id: 7, name: 'Grupo A' }],
      [
        { tournamentGroupId: 7, tournamentTeamId: 1 },
        { tournamentGroupId: 7, tournamentTeamId: 2 },
      ],
      [finished(1, 80, 3, 70, { groupId: 7 })],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.standingsState).toBe('EMPTY');
  });

  it('filters the tables down to the requested group', async () => {
    arrangeGroupStage(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [{ id: 8, name: 'Grupo B' }],
      [
        { tournamentGroupId: 8, tournamentTeamId: 1 },
        { tournamentGroupId: 8, tournamentTeamId: 2 },
      ],
      [finished(1, 80, 2, 70, { groupId: 8 })],
    );

    const tables = await service.findStandings(42, 12, 8);

    expect(mockPrisma.tournamentGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 8 }),
      }),
    );
    expect(tables).toHaveLength(1);
  });

  it('returns no table for a groupId that matches nothing', async () => {
    arrangeGroupStage([team(1, 'Alpha')], [], [], []);

    await expect(service.findStandings(42, 12, 999)).resolves.toEqual([]);
  });

  it('returns no table when a league is filtered by group', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    await expect(service.findStandings(42, 12, 7)).resolves.toEqual([]);
  });

  it('returns no table for a knockout tournament', async () => {
    mockPrisma.tournament.findFirst.mockResolvedValue({
      id: 12,
      status: TournamentStatus.IN_PROGRESS,
      format: TournamentFormat.KNOCKOUT,
    });

    await expect(service.findStandings(42, 12)).resolves.toEqual([]);
  });

  it('keeps a withdrawn registration in the table with its record', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo')],
      [finished(1, 80, 2, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.find((row) => row.tournamentTeamId === 2)?.played).toBe(
      1,
    );
  });

  // Points: Charlie 5, Alpha 3, Bravo 3, Delta 1.
  // Block {Alpha, Bravo}: head-to-head is the Alpha-Bravo game, won by Alpha.
  it('breaks a tie on head-to-head classification points', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [
        finished(1, 80, 2, 70),
        finished(3, 80, 1, 70),
        finished(2, 80, 3, 70),
        finished(3, 80, 4, 70),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([3, 1, 2, 4]);
  });

  // Alpha and Bravo split their two meetings (3 head-to-head points each),
  // so criterion 1 ties and criterion 2 decides: Alpha +15, Bravo -15.
  it('breaks a tie on head-to-head point difference', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [
        finished(1, 90, 2, 70),
        finished(2, 80, 1, 75),
        finished(1, 70, 3, 60),
        finished(2, 70, 3, 60),
        finished(3, 70, 4, 60),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([1, 2, 3, 4]);
  });

  // Circular results: 3 head-to-head points each, every head-to-head diff 0.
  // Criterion 3 decides on head-to-head points scored: 165, 160, 155.
  it('breaks a tie on head-to-head points scored', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Bravo'), team(3, 'Charlie')],
      [finished(1, 80, 2, 70), finished(2, 90, 3, 80), finished(3, 85, 1, 75)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([3, 2, 1]);
  });

  // Alpha and Bravo never met, so criteria 1-3 are all zero for both.
  // Criterion 4 decides on group-wide difference: Alpha +20, Bravo +5.
  it('breaks a tie on group-wide point difference', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [finished(1, 90, 3, 70), finished(2, 80, 4, 75)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([1, 2, 4, 3]);
  });

  // Same shape, but both differences are +20; criterion 5 decides on
  // group-wide points scored: Bravo 100, Alpha 90.
  it('breaks a tie on group-wide points scored', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [finished(1, 90, 3, 70), finished(2, 100, 4, 80)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([2, 1, 4, 3]);
  });

  // Every team on 6 points. Criterion 1 (whole-table head-to-head) ties;
  // criterion 2 splits into [Alpha +60], [Bravo +50], [Charlie, Delta -55].
  // The surviving pair restarts at criterion 1: their two meetings tie at 3
  // points each, and the recomputed head-to-head difference puts Delta (+5)
  // ahead of Charlie (-5) — the opposite of what the parent block's
  // criterion 3 would have said (Charlie 345 points scored, Delta 340).
  it('restarts the procedure for a sub-block that survives a split', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [
        finished(1, 90, 3, 70),
        finished(1, 80, 3, 60),
        finished(1, 80, 4, 60),
        finished(2, 80, 4, 60),
        finished(2, 80, 4, 60),
        finished(2, 70, 3, 60),
        finished(3, 90, 4, 75),
        finished(4, 85, 3, 65),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([1, 2, 4, 3]);
  });

  // Delta 6, then the block {Alpha, Zulu, Bravo} on 4 each.
  // Criterion 1 splits off Alpha (4 head-to-head points vs 1 and 1); the
  // remaining pair never met, so its restart falls through to criterion 4:
  // Zulu 0, Bravo -25. The names are deliberately out of order — an
  // implementation that drops the restart and falls back to the alphabetical
  // order returns [4, 1, 3, 2] and fails here.
  it('splits a block partially and resolves the remainder on its own', async () => {
    arrangeLeague(
      [team(1, 'Alpha'), team(2, 'Zulu'), team(3, 'Bravo'), team(4, 'Delta')],
      [
        finished(1, 80, 2, 70),
        finished(1, 80, 3, 70),
        finished(2, 90, 4, 70),
        finished(4, 80, 2, 70),
        finished(3, 85, 4, 80),
        finished(4, 90, 3, 70),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.map((row) => row.tournamentTeamId)).toEqual([4, 1, 2, 3]);
  });

  it('leaves a block resolved by a sporting criterion unflagged', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [
        finished(1, 80, 2, 70),
        finished(3, 80, 1, 70),
        finished(2, 80, 3, 70),
        finished(3, 80, 4, 70),
      ],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.every((row) => row.tieBlockKey === null)).toBe(true);
  });

  const drawFixtureMatches = () => [
    finished(1, 90, 3, 70),
    finished(2, 90, 4, 70),
  ];

  it('flags a block that exhausts every sporting criterion', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      drawFixtureMatches(),
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 1)?.isTiedUnresolved,
    ).toBe(true);
  });

  it('keys an unresolved block by its ascending team ids', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      drawFixtureMatches(),
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 2)?.tieBlockKey,
    ).toBe('1-2');
  });

  it('orders an unresolved block by team name', async () => {
    arrangeLeague(
      [
        team(2, 'Alpha'),
        team(1, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [finished(2, 90, 3, 70), finished(1, 90, 4, 70)],
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.slice(0, 2).map((row) => row.tournamentTeamId)).toEqual([
      2, 1,
    ]);
  });

  it('honours a draw recorded for the current block', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha', { tiebreakOrder: 2, tiebreakBlockKey: '1-2' }),
        team(2, 'Bravo', { tiebreakOrder: 1, tiebreakBlockKey: '1-2' }),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      drawFixtureMatches(),
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.slice(0, 2).map((row) => row.tournamentTeamId)).toEqual([
      2, 1,
    ]);
  });

  it('clears the unresolved flag once a draw is honoured', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha', { tiebreakOrder: 2, tiebreakBlockKey: '1-2' }),
        team(2, 'Bravo', { tiebreakOrder: 1, tiebreakBlockKey: '1-2' }),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      drawFixtureMatches(),
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 1)?.isTiedUnresolved,
    ).toBe(false);
  });

  it('keeps the tie block key on a resolved block so DELETE can address it', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha', { tiebreakOrder: 2, tiebreakBlockKey: '1-2' }),
        team(2, 'Bravo', { tiebreakOrder: 1, tiebreakBlockKey: '1-2' }),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      drawFixtureMatches(),
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 1)?.tieBlockKey,
    ).toBe('1-2');
  });

  it('ignores a draw recorded for a different block', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha', { tiebreakOrder: 2, tiebreakBlockKey: '1-2-9' }),
        team(2, 'Bravo', { tiebreakOrder: 1, tiebreakBlockKey: '1-2-9' }),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      drawFixtureMatches(),
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 1)?.isTiedUnresolved,
    ).toBe(true);
  });

  it('ignores a draw recorded for only part of the block', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha', { tiebreakOrder: 1, tiebreakBlockKey: '1-2' }),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      drawFixtureMatches(),
    );

    const [table] = await service.findStandings(42, 12);

    expect(
      table.rows.find((row) => row.tournamentTeamId === 2)?.isTiedUnresolved,
    ).toBe(true);
  });

  it('resolves each tie block independently', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie', { tiebreakOrder: 2, tiebreakBlockKey: '3-4' }),
        team(4, 'Delta', { tiebreakOrder: 1, tiebreakBlockKey: '3-4' }),
      ],
      drawFixtureMatches(),
    );

    const [table] = await service.findStandings(42, 12);

    expect(table.rows.slice(2).map((row) => row.tournamentTeamId)).toEqual([
      4, 3,
    ]);
  });

  function arrangeUnresolvedBlock(
    status: TournamentStatus = TournamentStatus.IN_PROGRESS,
  ): void {
    arrangeLeague(
      [
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [finished(1, 90, 3, 70), finished(2, 90, 4, 70)],
      status,
    );
    mockPrisma.$transaction.mockImplementation((callback: unknown) =>
      (callback as (tx: unknown) => Promise<unknown>)(mockPrisma),
    );
  }

  const drawEntries = [
    { tournamentTeamId: 2, order: 1 },
    { tournamentTeamId: 1, order: 2 },
  ];

  it('persists the order and the block key for every submitted entry', async () => {
    arrangeUnresolvedBlock();

    await service.setTiebreaks(42, 12, { entries: drawEntries });

    expect(mockPrisma.tournamentTeam.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { tiebreakOrder: 1, tiebreakBlockKey: '1-2' },
    });
  });

  it('writes every entry of the block inside one transaction', async () => {
    arrangeUnresolvedBlock();

    await service.setTiebreaks(42, 12, { entries: drawEntries });

    expect(mockPrisma.tournamentTeam.update).toHaveBeenCalledTimes(2);
  });

  it('returns the standings recomputed after the draw', async () => {
    arrangeUnresolvedBlock();
    mockPrisma.tournamentTeam.findMany
      .mockResolvedValueOnce([
        team(1, 'Alpha'),
        team(2, 'Bravo'),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ])
      .mockResolvedValueOnce([
        team(1, 'Alpha', { tiebreakOrder: 2, tiebreakBlockKey: '1-2' }),
        team(2, 'Bravo', { tiebreakOrder: 1, tiebreakBlockKey: '1-2' }),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ]);

    const [table] = await service.setTiebreaks(42, 12, {
      entries: drawEntries,
    });

    expect(table.rows.slice(0, 2).map((row) => row.tournamentTeamId)).toEqual([
      2, 1,
    ]);
  });

  it('corrects a block whose draw is already recorded', async () => {
    arrangeLeague(
      [
        team(1, 'Alpha', { tiebreakOrder: 1, tiebreakBlockKey: '1-2' }),
        team(2, 'Bravo', { tiebreakOrder: 2, tiebreakBlockKey: '1-2' }),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [finished(1, 90, 3, 70), finished(2, 90, 4, 70)],
    );
    mockPrisma.$transaction.mockImplementation((callback: unknown) =>
      (callback as (tx: unknown) => Promise<unknown>)(mockPrisma),
    );

    await service.setTiebreaks(42, 12, { entries: drawEntries });

    expect(mockPrisma.tournamentTeam.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { tiebreakOrder: 2, tiebreakBlockKey: '1-2' },
    });
  });

  it('rejects a set of teams that is not a current tie block', async () => {
    arrangeUnresolvedBlock();

    const error = await captureApiException(
      service.setTiebreaks(42, 12, {
        entries: [
          { tournamentTeamId: 1, order: 1 },
          { tournamentTeamId: 3, order: 2 },
        ],
      }),
    );

    expect(getApiErrorCode(error)).toBe('TIE_BLOCK_MISMATCH');
  });

  it('answers 409 when the submitted set is not a current tie block', async () => {
    arrangeUnresolvedBlock();

    const error = await captureApiException(
      service.setTiebreaks(42, 12, {
        entries: [
          { tournamentTeamId: 1, order: 1 },
          { tournamentTeamId: 3, order: 2 },
        ],
      }),
    );

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('rejects a partial block that omits one of its teams', async () => {
    arrangeUnresolvedBlock();

    const error = await captureApiException(
      service.setTiebreaks(42, 12, {
        entries: [
          { tournamentTeamId: 1, order: 1 },
          { tournamentTeamId: 2, order: 2 },
          { tournamentTeamId: 3, order: 3 },
        ],
      }),
    );

    expect(getApiErrorCode(error)).toBe('TIE_BLOCK_MISMATCH');
  });

  it('rejects an order that is not a complete permutation', async () => {
    arrangeUnresolvedBlock();

    const error = await captureApiException(
      service.setTiebreaks(42, 12, {
        entries: [
          { tournamentTeamId: 1, order: 1 },
          { tournamentTeamId: 2, order: 3 },
        ],
      }),
    );

    expect(getApiErrorCode(error)).toBe('INVALID_TIEBREAK_ORDER');
  });

  it('answers 422 for an order that is not a complete permutation', async () => {
    arrangeUnresolvedBlock();

    const error = await captureApiException(
      service.setTiebreaks(42, 12, {
        entries: [
          { tournamentTeamId: 1, order: 1 },
          { tournamentTeamId: 2, order: 3 },
        ],
      }),
    );

    expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('does not write when the order is not a complete permutation', async () => {
    arrangeUnresolvedBlock();

    await captureApiException(
      service.setTiebreaks(42, 12, {
        entries: [
          { tournamentTeamId: 1, order: 1 },
          { tournamentTeamId: 2, order: 3 },
        ],
      }),
    );

    expect(mockPrisma.tournamentTeam.update).not.toHaveBeenCalled();
  });

  it.each([TournamentStatus.COMPLETED, TournamentStatus.CANCELLED])(
    'rejects a draw while the tournament is %s',
    async (status) => {
      arrangeUnresolvedBlock(status);

      const error = await captureApiException(
        service.setTiebreaks(42, 12, { entries: drawEntries }),
      );

      expect(getApiErrorCode(error)).toBe('TOURNAMENT_NOT_MUTABLE');
    },
  );

  it('returns 404 before recording a draw in a cross-tenant tournament', async () => {
    mockPrisma.tournament.findFirst.mockResolvedValue(null);

    const error = await captureApiException(
      service.setTiebreaks(42, 999, { entries: drawEntries }),
    );

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  function arrangeResolvedBlock(
    status: TournamentStatus = TournamentStatus.IN_PROGRESS,
  ): void {
    arrangeLeague(
      [
        team(1, 'Alpha', { tiebreakOrder: 2, tiebreakBlockKey: '1-2' }),
        team(2, 'Bravo', { tiebreakOrder: 1, tiebreakBlockKey: '1-2' }),
        team(3, 'Charlie'),
        team(4, 'Delta'),
      ],
      [finished(1, 90, 3, 70), finished(2, 90, 4, 70)],
      status,
    );
  }

  it('clears the draw of the addressed block only', async () => {
    arrangeResolvedBlock();

    await service.clearTiebreaks(42, 12, '1-2');

    expect(mockPrisma.tournamentTeam.updateMany).toHaveBeenCalledWith({
      where: {
        tournamentId: 12,
        organizationId: 42,
        isDeleted: false,
        tiebreakBlockKey: '1-2',
      },
      data: { tiebreakOrder: null, tiebreakBlockKey: null },
    });
  });

  it('returns nothing after clearing a block', async () => {
    arrangeResolvedBlock();

    await expect(
      service.clearTiebreaks(42, 12, '1-2'),
    ).resolves.toBeUndefined();
  });

  it('rejects a block key that is not current', async () => {
    arrangeResolvedBlock();

    const error = await captureApiException(
      service.clearTiebreaks(42, 12, '1-2-9'),
    );

    expect(getApiErrorCode(error)).toBe('TIE_BLOCK_MISMATCH');
  });

  it('rejects a malformed block key the same way', async () => {
    arrangeResolvedBlock();

    const error = await captureApiException(
      service.clearTiebreaks(42, 12, 'not-a-key'),
    );

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('does not write when the block key is not current', async () => {
    arrangeResolvedBlock();

    await captureApiException(service.clearTiebreaks(42, 12, '1-2-9'));

    expect(mockPrisma.tournamentTeam.updateMany).not.toHaveBeenCalled();
  });

  it.each([TournamentStatus.COMPLETED, TournamentStatus.CANCELLED])(
    'rejects clearing a block while the tournament is %s',
    async (status) => {
      arrangeResolvedBlock(status);

      const error = await captureApiException(
        service.clearTiebreaks(42, 12, '1-2'),
      );

      expect(getApiErrorCode(error)).toBe('TOURNAMENT_NOT_MUTABLE');
    },
  );

  it('returns 404 before clearing a block in a cross-tenant tournament', async () => {
    mockPrisma.tournament.findFirst.mockResolvedValue(null);

    const error = await captureApiException(
      service.clearTiebreaks(42, 999, '1-2'),
    );

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });
});
