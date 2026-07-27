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
});
