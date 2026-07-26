import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TournamentStatus, TournamentTeamStatus } from '@prisma/client';
import { TournamentTeamsService } from './tournament-teams.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';

const mockPrisma: any = {
  tournament: {
    findFirst: jest.fn(),
  },
  tournamentTeam: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  team: {
    findFirst: jest.fn(),
  },
  organizationTeamAffiliation: {
    findFirst: jest.fn(),
  },
  tournamentBracketSlot: {
    findFirst: jest.fn(),
  },
};

const activeRegistration = {
  id: 41,
  tournamentId: 12,
  teamId: 8,
  status: TournamentTeamStatus.ACTIVE,
  seed: null,
  tiebreakOrder: null,
  tiebreakBlockKey: null,
  displayNameSnapshot: 'Engenharia PUC',
  createdAt: new Date('2026-01-02T14:00:00.000Z'),
  updatedAt: new Date('2026-07-26T18:00:00.000Z'),
};

describe('TournamentTeamsService', () => {
  let service: TournamentTeamsService;

  function arrangeActiveRegistration(tournamentStatus: TournamentStatus) {
    mockPrisma.tournamentTeam.findFirst.mockResolvedValue({
      ...activeRegistration,
      tournament: { status: tournamentStatus },
    });
  }

  function arrangeWithdrawnRegistration(tournamentStatus: TournamentStatus) {
    mockPrisma.tournamentTeam.findFirst.mockResolvedValue({
      ...activeRegistration,
      status: TournamentTeamStatus.WITHDRAWN,
      tournament: { status: tournamentStatus },
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentTeamsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TournamentTeamsService>(TournamentTeamsService);
  });

  describe('findAll', () => {
    it('scopes the parent before listing both registration statuses', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.REGISTRATION,
      });
      mockPrisma.tournamentTeam.count.mockResolvedValue(2);
      mockPrisma.tournamentTeam.findMany.mockResolvedValue([
        activeRegistration,
      ]);

      await service.findAll(42, 12, { page: 1, limit: 10 });

      expect(mockPrisma.tournament.findFirst).toHaveBeenCalledWith({
        where: { id: 12, organizationId: 42, isDeleted: false },
        select: { id: true, status: true },
      });
      expect(mockPrisma.tournamentTeam.count).toHaveBeenCalledWith({
        where: { AND: [{ tournamentId: 12, isDeleted: false }] },
      });
    });

    it('combines q, ids and explicit status with stable ordering', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.REGISTRATION,
      });
      mockPrisma.tournamentTeam.count.mockResolvedValue(1);
      mockPrisma.tournamentTeam.findMany.mockResolvedValue([
        activeRegistration,
      ]);

      await service.findAll(42, 12, {
        page: 2,
        limit: 5,
        q: 'Engenharia',
        ids: [41],
        status: TournamentTeamStatus.ACTIVE,
      });

      expect(mockPrisma.tournamentTeam.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { tournamentId: 12, isDeleted: false },
            { status: TournamentTeamStatus.ACTIVE },
            {
              displayNameSnapshot: {
                contains: 'Engenharia',
                mode: 'insensitive',
              },
            },
            { id: { in: [41] } },
          ],
        },
        skip: 5,
        take: 5,
        orderBy: [{ displayNameSnapshot: 'asc' }, { id: 'asc' }],
        select: expect.any(Object),
      });
    });

    it('throws 404 when the parent tournament is missing or cross-tenant', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);

      const err = await service
        .findAll(42, 999, { page: 1, limit: 10 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('create', () => {
    it.each([TournamentStatus.COMPLETED, TournamentStatus.CANCELLED])(
      'rejects registration writes when tournament is %s',
      async (status) => {
        mockPrisma.tournament.findFirst.mockResolvedValue({ id: 12, status });

        const error = await service
          .create(42, 12, { teamId: 8 })
          .catch((e) => e);

        expect(error.getResponse().error.code).toBe('TOURNAMENT_NOT_MUTABLE');
        expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      },
    );

    it.each([
      TournamentStatus.DRAFT,
      TournamentStatus.REGISTRATION,
      TournamentStatus.IN_PROGRESS,
    ])('reaches creation for a mutable tournament (%s)', async (status) => {
      mockPrisma.tournament.findFirst.mockResolvedValue({ id: 12, status });
      mockPrisma.team.findFirst.mockResolvedValue({
        id: 8,
        name: 'Engenharia PUC',
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 55,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentTeam.create.mockResolvedValue(activeRegistration);

      await service.create(42, 12, { teamId: 8 });

      expect(mockPrisma.tournamentTeam.create).toHaveBeenCalled();
    });

    it('creates from the active team and organization affiliation', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.REGISTRATION,
      });
      mockPrisma.team.findFirst.mockResolvedValue({
        id: 8,
        name: 'Engenharia PUC',
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 55,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentTeam.create.mockResolvedValue(activeRegistration);

      await service.create(42, 12, { teamId: 8 });

      expect(mockPrisma.tournamentTeam.create).toHaveBeenCalledWith({
        data: {
          organizationId: 42,
          tournamentId: 12,
          teamId: 8,
          organizationTeamAffiliationId: 55,
          displayNameSnapshot: 'Engenharia PUC',
        },
        select: expect.any(Object),
      });
    });

    it('reactivates the same withdrawn row without resetting history', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.REGISTRATION,
      });
      mockPrisma.team.findFirst.mockResolvedValue({
        id: 8,
        name: 'Engenharia PUC',
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 55,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue({
        id: 41,
        status: TournamentTeamStatus.WITHDRAWN,
      });
      mockPrisma.tournamentTeam.update.mockResolvedValue(activeRegistration);

      await service.create(42, 12, { teamId: 8 });

      expect(mockPrisma.tournamentTeam.update).toHaveBeenCalledWith({
        where: { id: 41 },
        data: {
          organizationTeamAffiliationId: 55,
          status: TournamentTeamStatus.ACTIVE,
        },
        select: expect.any(Object),
      });
    });

    it('rejects an inactive/deleted/missing team with 422 INVALID_TEAM', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.REGISTRATION,
      });
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const error = await service
        .create(42, 12, { teamId: 8 })
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.getResponse().error.code).toBe('INVALID_TEAM');
    });

    it('rejects a team without an active organization affiliation with 422 INVALID_TEAM', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.REGISTRATION,
      });
      mockPrisma.team.findFirst.mockResolvedValue({
        id: 8,
        name: 'Engenharia PUC',
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(null);

      const error = await service
        .create(42, 12, { teamId: 8 })
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.getResponse().error.code).toBe('INVALID_TEAM');
    });

    it('rejects an active duplicate registration with 409 DUPLICATE_RECORD', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.REGISTRATION,
      });
      mockPrisma.team.findFirst.mockResolvedValue({
        id: 8,
        name: 'Engenharia PUC',
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 55,
      });
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue({
        id: 41,
        status: TournamentTeamStatus.ACTIVE,
      });

      const error = await service
        .create(42, 12, { teamId: 8 })
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.getResponse().error.code).toBe('DUPLICATE_RECORD');
      expect(mockPrisma.tournamentTeam.create).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentTeam.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the parent tournament is missing or cross-tenant', async () => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);

      const err = await service
        .create(42, 999, { teamId: 8 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('update', () => {
    it.each([1, null])('updates seed to %s', async (seed) => {
      arrangeActiveRegistration(TournamentStatus.IN_PROGRESS);
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentTeam.update.mockResolvedValue({
        ...activeRegistration,
        seed,
      });

      await service.update(42, 41, { seed });

      expect(mockPrisma.tournamentTeam.update).toHaveBeenCalledWith({
        where: { id: 41 },
        data: { seed },
        select: expect.any(Object),
      });
    });

    it('returns the current row for an empty patch without writing', async () => {
      arrangeActiveRegistration(TournamentStatus.REGISTRATION);

      const result = await service.update(42, 41, {});

      expect(result).toEqual(activeRegistration);
      expect(mockPrisma.tournamentTeam.update).not.toHaveBeenCalled();
    });

    it('rejects a seed edit when any bracket slot references the registration', async () => {
      arrangeActiveRegistration(TournamentStatus.IN_PROGRESS);
      mockPrisma.tournamentBracketSlot.findFirst.mockResolvedValue({ id: 99 });

      const error = await service
        .update(42, 41, { seed: 2 })
        .catch((e) => e);

      expect(error.getResponse().error.code).toBe('REGISTRATION_IN_USE');
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mockPrisma.tournamentBracketSlot.findFirst).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          OR: [
            { homeTournamentTeamId: 41 },
            { awayTournamentTeamId: 41 },
            { winnerTournamentTeamId: 41 },
          ],
        },
      });
    });

    it('throws 404 for a missing/cross-tenant registration', async () => {
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);

      const err = await service
        .update(42, 999, { seed: 1 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('rejects a seed edit on a withdrawn registration with 422 INACTIVE_REGISTRATION', async () => {
      arrangeWithdrawnRegistration(TournamentStatus.REGISTRATION);

      const error = await service
        .update(42, 41, { seed: 1 })
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.getResponse().error.code).toBe('INACTIVE_REGISTRATION');
    });

    it.each([TournamentStatus.COMPLETED, TournamentStatus.CANCELLED])(
      'rejects seed edits when tournament is %s',
      async (status) => {
        arrangeActiveRegistration(status);

        const error = await service
          .update(42, 41, { seed: 1 })
          .catch((e) => e);

        expect(error.getResponse().error.code).toBe('TOURNAMENT_NOT_MUTABLE');
      },
    );
  });

  describe('remove', () => {
    it('withdraws without soft deleting or touching dependent rows', async () => {
      arrangeActiveRegistration(TournamentStatus.IN_PROGRESS);
      mockPrisma.tournamentTeam.update.mockResolvedValue({
        ...activeRegistration,
        status: TournamentTeamStatus.WITHDRAWN,
      });

      await service.remove(42, 41);

      expect(mockPrisma.tournamentTeam.update).toHaveBeenCalledWith({
        where: { id: 41 },
        data: { status: TournamentTeamStatus.WITHDRAWN },
      });
    });

    it('makes repeated withdrawal a successful no-op after lifecycle checks', async () => {
      arrangeWithdrawnRegistration(TournamentStatus.REGISTRATION);

      await service.remove(42, 41);

      expect(mockPrisma.tournamentTeam.update).not.toHaveBeenCalled();
    });

    it('rejects withdrawal of an already-withdrawn row in a terminal tournament', async () => {
      arrangeWithdrawnRegistration(TournamentStatus.COMPLETED);

      const error = await service.remove(42, 41).catch((e) => e);

      expect(error.getResponse().error.code).toBe('TOURNAMENT_NOT_MUTABLE');
      expect(mockPrisma.tournamentTeam.update).not.toHaveBeenCalled();
    });

    it('throws 404 for a missing/cross-tenant registration', async () => {
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);

      const err = await service.remove(42, 999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
