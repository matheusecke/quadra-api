import { Test, TestingModule } from '@nestjs/testing';
import {
  MatchStatus,
  TournamentFormat,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { TournamentsService } from './tournaments.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  tournament: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  season: {
    findFirst: jest.fn(),
  },
  tournamentCategory: {
    findFirst: jest.fn(),
  },
  tournamentTeam: {
    findFirst: jest.fn(),
  },
  tournamentBracketSlot: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  match: {
    groupBy: jest.fn(),
  },
  $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
    callback(mockPrisma),
  ),
};

const ORG_ID = 7;
const USER_ID = 9;

const SEASON = { id: 3, label: '2025/26' };

const baseTournamentRow = {
  id: 12,
  name: 'Copa de Verão',
  slug: 'copa-de-verao-2025-26',
  seasonId: 3,
  categoryId: 2,
  regulation: 'Jogos em quatro períodos de 10 minutos…',
  format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
  status: TournamentStatus.DRAFT,
  startsAt: null,
  endsAt: null,
  registrationStartsAt: null,
  registrationEndsAt: null,
  championTournamentTeamId: null,
  mvpTournamentRosterId: null,
  createdAt: new Date('2026-07-26T14:10:00.000Z'),
  updatedAt: new Date('2026-07-26T14:10:00.000Z'),
  _count: { teams: 0 },
};

describe('TournamentsService', () => {
  let service: TournamentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
  });

  describe('create', () => {
    it('derives the slug from the tournament name and the season label', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      mockPrisma.tournament.create.mockResolvedValue(baseTournamentRow);

      await service.create(ORG_ID, USER_ID, {
        name: 'Copa de Verão',
        seasonId: 3,
        format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
      });

      expect(mockPrisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'copa-de-verao-2025-26' }),
        }),
      );
    });

    it('appends a numeric suffix when the derived slug is taken', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournament.findFirst
        .mockResolvedValueOnce({ id: 99 })
        .mockResolvedValueOnce(null);
      mockPrisma.tournament.create.mockResolvedValue(baseTournamentRow);

      await service.create(ORG_ID, USER_ID, {
        name: 'Copa de Verão',
        seasonId: 3,
        format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
      });

      expect(mockPrisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'copa-de-verao-2025-26-2' }),
        }),
      );
    });

    it('rejects an explicit slug that is already taken', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournament.findFirst.mockResolvedValue({ id: 99 });

      await expect(
        service.create(ORG_ID, USER_ID, {
          name: 'Copa de Verão',
          seasonId: 3,
          format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
          slug: 'copa-verao-2026',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('normalizes an explicit slug through slugify', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      mockPrisma.tournament.create.mockResolvedValue(baseTournamentRow);

      await service.create(ORG_ID, USER_ID, {
        name: 'Copa de Verão',
        seasonId: 3,
        format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
        slug: 'Copa Verão 2026',
      });

      expect(mockPrisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'copa-verao-2026' }),
        }),
      );
    });

    it('rejects a season from another organization', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, {
          name: 'Copa de Verão',
          seasonId: 3,
          format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rejects a category from another organization', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournamentCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, {
          name: 'Copa de Verão',
          seasonId: 3,
          categoryId: 2,
          format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rejects startsAt after endsAt', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);

      await expect(
        service.create(ORG_ID, USER_ID, {
          name: 'Copa de Verão',
          seasonId: 3,
          format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
          startsAt: '2026-03-15T00:00:00.000Z',
          endsAt: '2026-01-10T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rejects registrationStartsAt after registrationEndsAt', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);

      await expect(
        service.create(ORG_ID, USER_ID, {
          name: 'Copa de Verão',
          seasonId: 3,
          format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
          registrationStartsAt: '2025-12-15T23:59:59.000Z',
          registrationEndsAt: '2025-11-01T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('defaults status to DRAFT when omitted', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      mockPrisma.tournament.create.mockResolvedValue(baseTournamentRow);

      await service.create(ORG_ID, USER_ID, {
        name: 'Copa de Verão',
        seasonId: 3,
        format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
      });

      const data = mockPrisma.tournament.create.mock.calls[0][0].data;
      expect(data.status).toBeUndefined();
    });

    it('persists createdByUserId from the caller', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      mockPrisma.tournament.create.mockResolvedValue(baseTournamentRow);

      await service.create(ORG_ID, USER_ID, {
        name: 'Copa de Verão',
        seasonId: 3,
        format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
      });

      expect(mockPrisma.tournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdByUserId: USER_ID }),
        }),
      );
    });

    it('returns zeroed counters for a new tournament', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      mockPrisma.tournament.create.mockResolvedValue(baseTournamentRow);

      const result = await service.create(ORG_ID, USER_ID, {
        name: 'Copa de Verão',
        seasonId: 3,
        format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
      });

      expect(result).toMatchObject({
        enrolledTeamCount: 0,
        matchCount: 0,
        finishedMatchCount: 0,
      });
    });

    it('derives isRegistrationOpen false when no registration window is set', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(SEASON);
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      mockPrisma.tournament.create.mockResolvedValue(baseTournamentRow);

      const result = await service.create(ORG_ID, USER_ID, {
        name: 'Copa de Verão',
        seasonId: 3,
        format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
      });

      expect(result.isRegistrationOpen).toBe(false);
    });
  });

  describe('findAll', () => {
    it('scopes every query to the caller organization', async () => {
      mockPrisma.tournament.count.mockResolvedValue(0);
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(mockPrisma.tournament.count).toHaveBeenCalledWith({
        where: { AND: [{ organizationId: ORG_ID, isDeleted: false }] },
      });
    });

    it('ANDs q, ids, seasonId, categoryId and status', async () => {
      mockPrisma.tournament.count.mockResolvedValue(0);
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, {
        page: 1,
        limit: 10,
        q: 'copa',
        ids: [12, 9],
        seasonId: 3,
        categoryId: 2,
        status: TournamentStatus.IN_PROGRESS,
      });

      expect(mockPrisma.tournament.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { organizationId: ORG_ID, isDeleted: false },
            { status: TournamentStatus.IN_PROGRESS },
            { id: { in: [12, 9] } },
            { seasonId: 3 },
            { categoryId: 2 },
            { name: { contains: 'copa', mode: 'insensitive' } },
          ],
        },
      });
    });

    it('matches q against the name, case-insensitively', async () => {
      mockPrisma.tournament.count.mockResolvedValue(0);
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { page: 1, limit: 10, q: 'copa' });

      expect(mockPrisma.tournament.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { name: { contains: 'copa', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('orders by startsAt descending with nulls first, then id descending', async () => {
      mockPrisma.tournament.count.mockResolvedValue(0);
      mockPrisma.tournament.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(mockPrisma.tournament.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { startsAt: { sort: 'desc', nulls: 'first' } },
            { id: 'desc' },
          ],
        }),
      );
    });

    it('returns count and data', async () => {
      mockPrisma.tournament.count.mockResolvedValue(1);
      mockPrisma.tournament.findMany.mockResolvedValue([baseTournamentRow]);
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(result).toEqual({
        count: 1,
        data: [expect.objectContaining({ id: baseTournamentRow.id })],
      });
    });

    it('excludes cancelled matches from matchCount', async () => {
      mockPrisma.tournament.count.mockResolvedValue(1);
      mockPrisma.tournament.findMany.mockResolvedValue([baseTournamentRow]);
      mockPrisma.match.groupBy.mockResolvedValue([
        {
          tournamentId: 12,
          status: MatchStatus.SCHEDULED,
          _count: { _all: 2 },
        },
        { tournamentId: 12, status: MatchStatus.FINISHED, _count: { _all: 3 } },
        {
          tournamentId: 12,
          status: MatchStatus.CANCELLED,
          _count: { _all: 1 },
        },
      ]);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(result.data[0]).toMatchObject({
        matchCount: 5,
        finishedMatchCount: 3,
      });
    });

    it('reports zero match counters for a tournament absent from the grouped result', async () => {
      const otherRow = { ...baseTournamentRow, id: 9 };
      mockPrisma.tournament.count.mockResolvedValue(2);
      mockPrisma.tournament.findMany.mockResolvedValue([
        baseTournamentRow,
        otherRow,
      ]);
      mockPrisma.match.groupBy.mockResolvedValue([
        { tournamentId: 12, status: MatchStatus.FINISHED, _count: { _all: 1 } },
      ]);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(result.data[1]).toMatchObject({
        matchCount: 0,
        finishedMatchCount: 0,
      });
    });

    it('issues a single grouped match query for the whole page', async () => {
      const otherRow = { ...baseTournamentRow, id: 9 };
      mockPrisma.tournament.count.mockResolvedValue(2);
      mockPrisma.tournament.findMany.mockResolvedValue([
        baseTournamentRow,
        otherRow,
      ]);
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(mockPrisma.match.groupBy).toHaveBeenCalledTimes(1);
      expect(mockPrisma.match.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tournamentId: { in: [12, 9] },
          }),
        }),
      );
    });
  });

  describe('isRegistrationOpen (via findOne)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('is false when both registration dates are null', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      mockPrisma.tournament.findFirst.mockResolvedValue({
        ...baseTournamentRow,
        registrationStartsAt: null,
        registrationEndsAt: null,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.findOne(ORG_ID, 12);

      expect(result.isRegistrationOpen).toBe(false);
    });

    it('is true when only registrationStartsAt is set and it has passed', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      mockPrisma.tournament.findFirst.mockResolvedValue({
        ...baseTournamentRow,
        registrationStartsAt: new Date('2025-12-01T00:00:00.000Z'),
        registrationEndsAt: null,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.findOne(ORG_ID, 12);

      expect(result.isRegistrationOpen).toBe(true);
    });

    it('is false when only registrationEndsAt is set and it has passed', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      mockPrisma.tournament.findFirst.mockResolvedValue({
        ...baseTournamentRow,
        registrationStartsAt: null,
        registrationEndsAt: new Date('2025-12-01T00:00:00.000Z'),
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.findOne(ORG_ID, 12);

      expect(result.isRegistrationOpen).toBe(false);
    });

    it('is true when now falls inside both bounds', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      mockPrisma.tournament.findFirst.mockResolvedValue({
        ...baseTournamentRow,
        registrationStartsAt: new Date('2025-11-01T00:00:00.000Z'),
        registrationEndsAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.findOne(ORG_ID, 12);

      expect(result.isRegistrationOpen).toBe(true);
    });
  });

  describe('findOne', () => {
    it('returns the read model with counters', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(baseTournamentRow);
      mockPrisma.match.groupBy.mockResolvedValue([
        { tournamentId: 12, status: MatchStatus.FINISHED, _count: { _all: 9 } },
        {
          tournamentId: 12,
          status: MatchStatus.SCHEDULED,
          _count: { _all: 5 },
        },
      ]);

      const result = await service.findOne(ORG_ID, 12);

      expect(result).toMatchObject({
        id: 12,
        enrolledTeamCount: 0,
        matchCount: 14,
        finishedMatchCount: 9,
      });
    });

    it('raises 404 for a tournament of another organization', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 12)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('update', () => {
    it('merges a partial payload against the stored row for the date range check', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        ...baseTournamentRow,
        startsAt: new Date('2026-01-10T00:00:00.000Z'),
        endsAt: new Date('2026-03-15T00:00:00.000Z'),
      });

      await expect(
        service.update(ORG_ID, 12, {
          endsAt: '2026-01-05T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('leaves the slug untouched when the name changes', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(baseTournamentRow);
      mockPrisma.tournament.update.mockResolvedValue(baseTournamentRow);
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.update(ORG_ID, 12, { name: 'Copa de Verão 2026' });

      const data = mockPrisma.tournament.update.mock.calls[0][0].data;
      expect(data.slug).toBeUndefined();
    });

    it('changes the slug when one is sent explicitly', async () => {
      mockPrisma.tournament.findFirst
        .mockResolvedValueOnce(baseTournamentRow)
        .mockResolvedValueOnce(null);
      mockPrisma.tournament.update.mockResolvedValue(baseTournamentRow);
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.update(ORG_ID, 12, { slug: 'copa-2026' });

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'copa-2026' }),
        }),
      );
    });

    it('rejects an explicit slug taken by another tournament', async () => {
      mockPrisma.tournament.findFirst
        .mockResolvedValueOnce(baseTournamentRow)
        .mockResolvedValueOnce({ id: 55 });

      await expect(
        service.update(ORG_ID, 12, { slug: 'taken-slug' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('clears categoryId on an explicit null', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(baseTournamentRow);
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        categoryId: null,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.update(ORG_ID, 12, { categoryId: null });

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: null }),
        }),
      );
    });

    it('clears regulation on an explicit null', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(baseTournamentRow);
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        regulation: null,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.update(ORG_ID, 12, { regulation: null });

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ regulation: null }),
        }),
      );
    });

    it('validates a new seasonId against the caller organization', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(baseTournamentRow);
      mockPrisma.season.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 12, { seasonId: 99 }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rejects a status change on a completed tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        ...baseTournamentRow,
        status: TournamentStatus.COMPLETED,
      });

      await expect(
        service.update(ORG_ID, 12, { status: TournamentStatus.IN_PROGRESS }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('allows editing other fields of a completed tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        ...baseTournamentRow,
        status: TournamentStatus.COMPLETED,
      });
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        status: TournamentStatus.COMPLETED,
        name: 'Renamed',
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.update(ORG_ID, 12, { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
    });

    it('allows a status change on a non-completed tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(baseTournamentRow);
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        status: TournamentStatus.IN_PROGRESS,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.update(ORG_ID, 12, {
        status: TournamentStatus.IN_PROGRESS,
      });

      expect(result.status).toBe(TournamentStatus.IN_PROGRESS);
    });

    it('raises 404 for a tournament of another organization', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 12, { name: 'Anything' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('returns the current record for an empty payload', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(baseTournamentRow);
      mockPrisma.tournament.update.mockResolvedValue(baseTournamentRow);
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.update(ORG_ID, 12, {});

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
    });
  });

  describe('complete', () => {
    it('raises 404 for a tournament of another organization', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);

      await expect(service.complete(ORG_ID, 12, {})).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a tournament that is not in progress', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.DRAFT,
        format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
      });

      await expect(service.complete(ORG_ID, 12, {})).rejects.toMatchObject({
        status: 409,
      });
    });

    it('rejects a champion on a group stage tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.GROUP_STAGE,
      });

      await expect(
        service.complete(ORG_ID, 12, { championTournamentTeamId: 41 }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('completes a group stage tournament with no champion', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.GROUP_STAGE,
      });
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        format: TournamentFormat.GROUP_STAGE,
        status: TournamentStatus.COMPLETED,
        championTournamentTeamId: null,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.complete(ORG_ID, 12, {});

      expect(result).toMatchObject({
        status: TournamentStatus.COMPLETED,
        championTournamentTeamId: null,
      });
    });

    it('requires a champion for a league tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.LEAGUE,
      });

      await expect(service.complete(ORG_ID, 12, {})).rejects.toMatchObject({
        status: 422,
      });
    });

    it('requires a champion for a knockout tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.KNOCKOUT,
      });

      await expect(service.complete(ORG_ID, 12, {})).rejects.toMatchObject({
        status: 422,
      });
    });

    it('rejects a champion that is not enrolled in this tournament', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.LEAGUE,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);

      await expect(
        service.complete(ORG_ID, 12, { championTournamentTeamId: 41 }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rejects a withdrawn team as champion', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.LEAGUE,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);

      await expect(
        service.complete(ORG_ID, 12, { championTournamentTeamId: 41 }),
      ).rejects.toMatchObject({ status: 422 });

      expect(mockPrisma.tournamentTeam.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: TournamentTeamStatus.ACTIVE,
          }),
        }),
      );
    });

    it('rejects a knockout champion that won no bracket slot', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.KNOCKOUT,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue({ id: 41 });
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValue(null);

      await expect(
        service.complete(ORG_ID, 12, { championTournamentTeamId: 41 }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('accepts a knockout champion that won any bracket slot', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.KNOCKOUT,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue({ id: 41 });
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValue({ id: 5 });
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        format: TournamentFormat.KNOCKOUT,
        status: TournamentStatus.COMPLETED,
        championTournamentTeamId: 41,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      const result = await service.complete(ORG_ID, 12, {
        championTournamentTeamId: 41,
      });

      expect(result.championTournamentTeamId).toBe(41);
    });

    it('does not require a bracket slot for a league champion', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.LEAGUE,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue({ id: 41 });
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        format: TournamentFormat.LEAGUE,
        status: TournamentStatus.COMPLETED,
        championTournamentTeamId: 41,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.complete(ORG_ID, 12, { championTournamentTeamId: 41 });

      expect(mockPrisma.tournamentBracketSlot.findFirst).not.toHaveBeenCalled();
    });

    it('writes status and champion in the same update', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.LEAGUE,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue({ id: 41 });
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        format: TournamentFormat.LEAGUE,
        status: TournamentStatus.COMPLETED,
        championTournamentTeamId: 41,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.complete(ORG_ID, 12, { championTournamentTeamId: 41 });

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TournamentStatus.COMPLETED,
            championTournamentTeamId: 41,
          }),
        }),
      );
    });

    it('runs the validations and the write inside one transaction', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
        format: TournamentFormat.GROUP_STAGE,
      });
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        format: TournamentFormat.GROUP_STAGE,
        status: TournamentStatus.COMPLETED,
        championTournamentTeamId: null,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.complete(ORG_ID, 12, {});

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tournament.findFirst).toHaveBeenCalled();
    });
  });

  describe('reopen', () => {
    it('raises 404 for a tournament of another organization', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);

      await expect(service.reopen(ORG_ID, 12)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a tournament that is not completed', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.IN_PROGRESS,
      });

      await expect(service.reopen(ORG_ID, 12)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('writes IN_PROGRESS and clears the champion in the same update', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.COMPLETED,
      });
      mockPrisma.tournament.update.mockResolvedValue({
        ...baseTournamentRow,
        status: TournamentStatus.IN_PROGRESS,
        championTournamentTeamId: null,
      });
      mockPrisma.match.groupBy.mockResolvedValue([]);

      await service.reopen(ORG_ID, 12);

      expect(mockPrisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: TournamentStatus.IN_PROGRESS,
            championTournamentTeamId: null,
          },
        }),
      );
    });
  });
});
