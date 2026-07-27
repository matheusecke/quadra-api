import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TournamentFormat, TournamentStatus } from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  TournamentGroupsService,
  tournamentGroupSelect,
  tournamentGroupTeamSelect,
} from './tournament-groups.service';

const mockPrisma: any = {
  tournament: { findFirst: jest.fn() },
  tournamentGroup: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  tournamentGroupTeam: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  tournamentTeam: { findFirst: jest.fn() },
};

const groupRow = {
  id: 7,
  tournamentId: 12,
  name: 'Group A',
  sortOrder: 1,
  createdAt: new Date('2026-07-26T18:00:00.000Z'),
  updatedAt: new Date('2026-07-26T18:00:00.000Z'),
};

const membershipRow = {
  id: 31,
  tournamentId: 12,
  tournamentGroupId: 7,
  tournamentTeamId: 41,
  createdAt: new Date('2026-07-26T18:10:00.000Z'),
  updatedAt: new Date('2026-07-26T18:10:00.000Z'),
};

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

describe('TournamentGroupsService', () => {
  let service: TournamentGroupsService;

  function arrangeMutableTournament(
    status: TournamentStatus = TournamentStatus.REGISTRATION,
    format: TournamentFormat = TournamentFormat.GROUP_STAGE,
  ): void {
    mockPrisma.tournament.findFirst.mockResolvedValue({
      id: 12,
      status,
      format,
    });
  }

  function arrangeGroupTarget(
    status: TournamentStatus = TournamentStatus.REGISTRATION,
    format: TournamentFormat = TournamentFormat.GROUP_STAGE_KNOCKOUT,
  ): void {
    mockPrisma.tournamentGroup.findFirst.mockResolvedValue({
      ...groupRow,
      tournament: { status, format },
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TournamentGroupsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(TournamentGroupsService);
  });

  it('scopes the parent and returns the complete ordered group list', async () => {
    mockPrisma.tournament.findFirst.mockResolvedValue({
      id: 12,
      status: TournamentStatus.COMPLETED,
      format: TournamentFormat.LEAGUE,
    });
    mockPrisma.tournamentGroup.findMany.mockResolvedValue([groupRow]);

    await expect(service.findGroups(42, 12)).resolves.toEqual([groupRow]);

    expect(mockPrisma.tournament.findFirst).toHaveBeenCalledWith({
      where: { id: 12, organizationId: 42, isDeleted: false },
      select: { id: true, status: true, format: true },
    });
    expect(mockPrisma.tournamentGroup.findMany).toHaveBeenCalledWith({
      where: { tournamentId: 12, organizationId: 42, isDeleted: false },
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
      select: tournamentGroupSelect,
    });
  });

  it('returns the complete ordered membership list for any tournament status', async () => {
    mockPrisma.tournament.findFirst.mockResolvedValue({
      id: 12,
      status: TournamentStatus.CANCELLED,
      format: TournamentFormat.KNOCKOUT,
    });
    mockPrisma.tournamentGroupTeam.findMany.mockResolvedValue([membershipRow]);

    await expect(service.findGroupTeams(42, 12)).resolves.toEqual([
      membershipRow,
    ]);
    expect(mockPrisma.tournamentGroupTeam.findMany).toHaveBeenCalledWith({
      where: { tournamentId: 12, organizationId: 42, isDeleted: false },
      orderBy: [
        { tournamentGroupId: 'asc' },
        { tournamentTeamId: 'asc' },
        { id: 'asc' },
      ],
      select: tournamentGroupTeamSelect,
    });
  });

  it.each([
    ['groups', (target: TournamentGroupsService) => target.findGroups(42, 999)],
    [
      'memberships',
      (target: TournamentGroupsService) => target.findGroupTeams(42, 999),
    ],
  ])(
    'returns 404 before listing missing or cross-tenant %s',
    async (_label, call) => {
      mockPrisma.tournament.findFirst.mockResolvedValue(null);
      const error = await captureApiException(call(service));
      expect(error).toBeInstanceOf(ApiException);
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.tournamentGroup.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentGroupTeam.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    TournamentStatus.DRAFT,
    TournamentStatus.REGISTRATION,
    TournamentStatus.IN_PROGRESS,
  ])('creates a group while the tournament is %s', async (status) => {
    mockPrisma.tournament.findFirst.mockResolvedValue({
      id: 12,
      status,
      format: TournamentFormat.GROUP_STAGE,
    });
    mockPrisma.tournamentGroup.findFirst.mockResolvedValue(null);
    mockPrisma.tournamentGroup.aggregate.mockResolvedValue({
      _max: { sortOrder: 2 },
    });
    mockPrisma.tournamentGroup.create.mockResolvedValue({
      ...groupRow,
      id: 9,
      name: 'Group C',
      sortOrder: 3,
    });

    await service.createGroup(42, 12, { name: 'Group C' });

    expect(mockPrisma.tournamentGroup.create).toHaveBeenCalledWith({
      data: {
        organizationId: 42,
        tournamentId: 12,
        name: 'Group C',
        sortOrder: 3,
      },
      select: tournamentGroupSelect,
    });
  });

  it.each([TournamentStatus.COMPLETED, TournamentStatus.CANCELLED])(
    'rejects group writes while the tournament is %s',
    async (status) => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status,
        format: TournamentFormat.GROUP_STAGE,
      });
      const error = await captureApiException(
        service.createGroup(42, 12, { name: 'Group A' }),
      );
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect((error.getResponse() as any).error.code).toBe(
        'TOURNAMENT_NOT_MUTABLE',
      );
    },
  );

  it.each([TournamentFormat.LEAGUE, TournamentFormat.KNOCKOUT])(
    'rejects group writes for %s tournaments',
    async (format) => {
      mockPrisma.tournament.findFirst.mockResolvedValue({
        id: 12,
        status: TournamentStatus.DRAFT,
        format,
      });
      const error = await captureApiException(
        service.createGroup(42, 12, { name: 'Group A' }),
      );
      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect((error.getResponse() as any).error.code).toBe(
        'INVALID_TOURNAMENT_FORMAT',
      );
    },
  );

  it('starts sortOrder at one when the tournament has no active groups', async () => {
    arrangeMutableTournament();
    mockPrisma.tournamentGroup.findFirst.mockResolvedValue(null);
    mockPrisma.tournamentGroup.aggregate.mockResolvedValue({
      _max: { sortOrder: null },
    });
    mockPrisma.tournamentGroup.create.mockResolvedValue(groupRow);

    await service.createGroup(42, 12, { name: 'Group A' });

    expect(mockPrisma.tournamentGroup.aggregate).toHaveBeenCalledWith({
      where: { tournamentId: 12, organizationId: 42, isDeleted: false },
      _max: { sortOrder: true },
    });
    expect(mockPrisma.tournamentGroup.create.mock.calls[0][0].data.sortOrder).toBe(
      1,
    );
  });

  it('returns DUPLICATE_RECORD for an active exact-name conflict', async () => {
    arrangeMutableTournament();
    mockPrisma.tournamentGroup.findFirst.mockResolvedValue({ id: 7 });

    const error = await captureApiException(
      service.createGroup(42, 12, { name: 'Group A' }),
    );

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect((error.getResponse() as any).error.code).toBe('DUPLICATE_RECORD');
    expect(mockPrisma.tournamentGroup.create).not.toHaveBeenCalled();
  });

  it('renames a tenant group and keeps sortOrder server-owned', async () => {
    arrangeGroupTarget();
    mockPrisma.tournamentGroup.findFirst
      .mockResolvedValueOnce({
        ...groupRow,
        tournament: {
          status: TournamentStatus.IN_PROGRESS,
          format: TournamentFormat.GROUP_STAGE_KNOCKOUT,
        },
      })
      .mockResolvedValueOnce(null);
    mockPrisma.tournamentGroup.update.mockResolvedValue({
      ...groupRow,
      name: 'Gold Group',
    });

    await service.updateGroup(42, 7, { name: 'Gold Group' });

    expect(mockPrisma.tournamentGroup.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { name: 'Gold Group' },
      select: tournamentGroupSelect,
    });
  });

  it('returns the current row for an empty patch without writing', async () => {
    arrangeGroupTarget();

    await expect(service.updateGroup(42, 7, {})).resolves.toEqual(groupRow);
    expect(mockPrisma.tournamentGroup.update).not.toHaveBeenCalled();
  });

  it('soft-deletes an empty group', async () => {
    arrangeGroupTarget(TournamentStatus.DRAFT);
    mockPrisma.tournamentGroupTeam.findFirst.mockResolvedValue(null);

    await service.removeGroup(42, 7);

    expect(mockPrisma.tournamentGroupTeam.findFirst).toHaveBeenCalledWith({
      where: { tournamentGroupId: 7, organizationId: 42, isDeleted: false },
      select: { id: true },
    });
    expect(mockPrisma.tournamentGroup.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { isDeleted: true },
    });
  });

  it('rejects deleting a group with an active membership', async () => {
    arrangeGroupTarget();
    mockPrisma.tournamentGroupTeam.findFirst.mockResolvedValue({ id: 31 });

    const error = await captureApiException(service.removeGroup(42, 7));

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect((error.getResponse() as any).error.code).toBe('GROUP_NOT_EMPTY');
    expect(mockPrisma.tournamentGroup.update).not.toHaveBeenCalled();
  });

  it.each([
    TournamentStatus.DRAFT,
    TournamentStatus.REGISTRATION,
    TournamentStatus.IN_PROGRESS,
  ])('accepts an empty rename while the tournament is %s', async (status) => {
    arrangeGroupTarget(status);
    await expect(service.updateGroup(42, 7, {})).resolves.toEqual(groupRow);
  });

  it.each([
    TournamentStatus.DRAFT,
    TournamentStatus.REGISTRATION,
    TournamentStatus.IN_PROGRESS,
  ])('deletes an empty group while the tournament is %s', async (status) => {
    arrangeGroupTarget(status);
    mockPrisma.tournamentGroupTeam.findFirst.mockResolvedValue(null);
    await expect(service.removeGroup(42, 7)).resolves.toBeUndefined();
  });

  it.each([
    [
      'update',
      (target: TournamentGroupsService) => target.updateGroup(42, 7, {}),
    ],
    [
      'delete',
      (target: TournamentGroupsService) => target.removeGroup(42, 7),
    ],
  ])('enforces lifecycle and format on group %s', async (_label, call) => {
    for (const status of [
      TournamentStatus.COMPLETED,
      TournamentStatus.CANCELLED,
    ]) {
      jest.clearAllMocks();
      arrangeGroupTarget(status);
      const error = await captureApiException(call(service));
      expect((error.getResponse() as any).error.code).toBe(
        'TOURNAMENT_NOT_MUTABLE',
      );
    }

    for (const format of [
      TournamentFormat.LEAGUE,
      TournamentFormat.KNOCKOUT,
    ]) {
      jest.clearAllMocks();
      arrangeGroupTarget(TournamentStatus.DRAFT, format);
      const error = await captureApiException(call(service));
      expect((error.getResponse() as any).error.code).toBe(
        'INVALID_TOURNAMENT_FORMAT',
      );
    }
  });

  it.each([
    (target: TournamentGroupsService) => target.updateGroup(42, 7, {}),
    (target: TournamentGroupsService) => target.removeGroup(42, 7),
  ])('returns 404 for a missing or cross-tenant group', async (call) => {
    mockPrisma.tournamentGroup.findFirst.mockResolvedValue(null);
    const error = await captureApiException(call(service));
    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('rejects renaming to another active exact group name', async () => {
    mockPrisma.tournamentGroup.findFirst
      .mockResolvedValueOnce({
        ...groupRow,
        tournament: {
          status: TournamentStatus.REGISTRATION,
          format: TournamentFormat.GROUP_STAGE,
        },
      })
      .mockResolvedValueOnce({ id: 8 });

    const error = await captureApiException(
      service.updateGroup(42, 7, { name: 'Gold Group' }),
    );

    expect(mockPrisma.tournamentGroup.findFirst).toHaveBeenLastCalledWith({
      where: {
        tournamentId: 12,
        organizationId: 42,
        name: 'Gold Group',
        id: { not: 7 },
        isDeleted: false,
      },
      select: { id: true },
    });
    expect((error.getResponse() as any).error.code).toBe('DUPLICATE_RECORD');
    expect(mockPrisma.tournamentGroup.update).not.toHaveBeenCalled();
  });
});
