import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import {
  OrgRole,
  RosterRole,
  RosterStatus,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { TournamentRostersService } from './tournament-rosters.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const mockPrisma: any = {
  tournamentTeam: {
    findFirst: jest.fn(),
  },
  tournamentRoster: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
  organizationUserAffiliation: {
    findFirst: jest.fn(),
  },
};

const activeRosterRow = {
  id: 88,
  tournamentId: 12,
  tournamentTeamId: 41,
  userId: 165,
  role: RosterRole.ATHLETE,
  jerseyNumberSnapshot: 7,
  displayNameSnapshot: 'Rafael Moura',
  status: RosterStatus.ACTIVE,
  joinedAt: new Date('2026-01-03T11:30:00.000Z'),
  leftAt: null,
  createdAt: new Date('2026-01-03T11:30:00.000Z'),
  updatedAt: new Date('2026-07-26T18:10:00.000Z'),
};

const orgAdmin: JwtPayload = {
  sub: 1,
  email: 'admin@example.com',
  isSystemAdmin: false,
  organizationId: 42,
  role: OrgRole.ORG_ADMIN,
};

const teamActor: JwtPayload = {
  sub: 501,
  email: 'coach@example.com',
  isSystemAdmin: false,
  organizationId: 42,
  role: OrgRole.TEAM_ADMIN,
};

const eligibleMember = {
  id: 77,
  role: OrgRole.ATHLETE,
  jerseyNumber: 7,
};

const eligibleUser = {
  id: 165,
  name: 'Rafael Moura',
};

const validCreateDto = {
  userId: 165,
  tournamentTeamId: 41,
  role: RosterRole.ATHLETE,
};

describe('TournamentRostersService', () => {
  let service: TournamentRostersService;

  function arrangeValidRegistration(
    tournamentStatus: TournamentStatus,
    registrationStatus: TournamentTeamStatus = TournamentTeamStatus.ACTIVE,
  ) {
    mockPrisma.tournamentTeam.findFirst.mockResolvedValue({
      id: 41,
      tournamentId: 12,
      teamId: 8,
      status: registrationStatus,
      tournament: { status: tournamentStatus },
    });
  }

  function arrangeEligibleMember(role: OrgRole, jerseyNumber: number | null) {
    mockPrisma.user.findFirst.mockResolvedValue(eligibleUser);
    mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
      ...eligibleMember,
      role,
      jerseyNumber,
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentRostersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TournamentRostersService>(TournamentRostersService);
  });

  describe('findAll', () => {
    it('returns active roster rows for a tenant registration without pagination', async () => {
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue({ id: 41 });
      mockPrisma.tournamentRoster.findMany.mockResolvedValue([
        activeRosterRow,
      ]);

      const result = await service.findAll(42, 41);

      expect(mockPrisma.tournamentTeam.findFirst).toHaveBeenCalledWith({
        where: { id: 41, organizationId: 42, isDeleted: false },
        select: { id: true },
      });
      expect(mockPrisma.tournamentRoster.findMany).toHaveBeenCalledWith({
        where: {
          tournamentTeamId: 41,
          status: RosterStatus.ACTIVE,
          isDeleted: false,
        },
        orderBy: [
          { role: 'asc' },
          { displayNameSnapshot: 'asc' },
          { id: 'asc' },
        ],
        select: expect.any(Object),
      });
      expect(result[0].jerseyNumber).toBe(7);
      expect(result[0]).not.toHaveProperty('jerseyNumberSnapshot');
    });

    it('reads the roster of a withdrawn tournament team without a status filter', async () => {
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue({ id: 41 });
      mockPrisma.tournamentRoster.findMany.mockResolvedValue([
        activeRosterRow,
      ]);

      const result = await service.findAll(42, 41);

      expect(mockPrisma.tournamentTeam.findFirst).toHaveBeenCalledWith({
        where: { id: 41, organizationId: 42, isDeleted: false },
        select: { id: true },
      });
      expect(result).toHaveLength(1);
    });

    it('throws 404 when the registration is missing or cross-tenant', async () => {
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);

      const err = await service.findAll(42, 999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('create', () => {
    it('lets an organization admin create for any tenant team', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.ATHLETE, 7);
      mockPrisma.tournamentRoster.findFirst
        .mockResolvedValueOnce(null) // same registration
        .mockResolvedValueOnce(null); // other active athlete team
      mockPrisma.tournamentRoster.create.mockResolvedValue(activeRosterRow);

      await service.create(orgAdmin, validCreateDto);

      expect(mockPrisma.tournamentRoster.create).toHaveBeenCalledWith({
        data: {
          organizationId: 42,
          tournamentId: 12,
          tournamentTeamId: 41,
          userId: 165,
          organizationUserAffiliationId: 77,
          role: RosterRole.ATHLETE,
          jerseyNumberSnapshot: 7,
          displayNameSnapshot: 'Rafael Moura',
          joinedAt: expect.any(Date),
        },
        select: expect.any(Object),
      });
    });

    it.each([OrgRole.TEAM_ADMIN, OrgRole.COACHING_STAFF])(
      'allows %s only with an active affiliation to the registration team',
      async (role) => {
        arrangeValidRegistration(TournamentStatus.IN_PROGRESS);
        mockPrisma.organizationUserAffiliation.findFirst
          .mockResolvedValueOnce({ id: 70 }) // actor affiliation
          .mockResolvedValueOnce(eligibleMember); // target affiliation
        mockPrisma.user.findFirst.mockResolvedValue(eligibleUser);
        mockPrisma.tournamentRoster.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);
        mockPrisma.tournamentRoster.create.mockResolvedValue(activeRosterRow);

        await service.create({ ...teamActor, role }, validCreateDto);

        expect(mockPrisma.tournamentRoster.create).toHaveBeenCalled();
      },
    );

    it('returns FORBIDDEN when a team-scoped actor targets another team', async () => {
      arrangeValidRegistration(TournamentStatus.IN_PROGRESS);
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);

      const error = await service
        .create(teamActor, validCreateDto)
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(error.getResponse().error.code).toBe('FORBIDDEN');
      expect(mockPrisma.tournamentRoster.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the registration is missing or cross-tenant', async () => {
      mockPrisma.tournamentTeam.findFirst.mockResolvedValue(null);

      const error = await service
        .create(orgAdmin, validCreateDto)
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it.each([TournamentStatus.COMPLETED, TournamentStatus.CANCELLED])(
      'rejects roster writes when tournament is %s',
      async (status) => {
        arrangeValidRegistration(status);

        const error = await service
          .create(orgAdmin, validCreateDto)
          .catch((e) => e);

        expect(error.getResponse().error.code).toBe('TOURNAMENT_NOT_MUTABLE');
      },
    );

    it('rejects a withdrawn team registration with 422 INACTIVE_REGISTRATION', async () => {
      arrangeValidRegistration(
        TournamentStatus.REGISTRATION,
        TournamentTeamStatus.WITHDRAWN,
      );

      const error = await service
        .create(orgAdmin, validCreateDto)
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.getResponse().error.code).toBe('INACTIVE_REGISTRATION');
    });

    it('rejects an inactive/deleted/missing user with 422 INVALID_ROSTER_MEMBER', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const error = await service
        .create(orgAdmin, validCreateDto)
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.getResponse().error.code).toBe('INVALID_ROSTER_MEMBER');
    });

    it('rejects a user without an active same-team affiliation with 422 INVALID_ROSTER_MEMBER', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      mockPrisma.user.findFirst.mockResolvedValue(eligibleUser);
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);

      const error = await service
        .create(orgAdmin, validCreateDto)
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.getResponse().error.code).toBe('INVALID_ROSTER_MEMBER');
    });

    it('rejects an affiliation role that differs from the requested roster role with 422 INVALID_ROSTER_ROLE', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.COACHING_STAFF, null);

      const error = await service
        .create(orgAdmin, validCreateDto)
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.getResponse().error.code).toBe('INVALID_ROSTER_ROLE');
    });

    it('rejects an active duplicate on the same registration with 409 DUPLICATE_RECORD', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.ATHLETE, 7);
      mockPrisma.tournamentRoster.findFirst.mockResolvedValueOnce({
        id: 88,
        status: RosterStatus.ACTIVE,
      });

      const error = await service
        .create(orgAdmin, validCreateDto)
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.getResponse().error.code).toBe('DUPLICATE_RECORD');
      expect(mockPrisma.tournamentRoster.create).not.toHaveBeenCalled();
      expect(mockPrisma.tournamentRoster.update).not.toHaveBeenCalled();
    });

    it('rejects an athlete already active for another team in the tournament with 409 ATHLETE_ALREADY_REGISTERED', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.ATHLETE, 7);
      mockPrisma.tournamentRoster.findFirst
        .mockResolvedValueOnce(null) // same registration
        .mockResolvedValueOnce({ id: 90 }); // other active athlete team

      const error = await service
        .create(orgAdmin, validCreateDto)
        .catch((e) => e);

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.getResponse().error.code).toBe(
        'ATHLETE_ALREADY_REGISTERED',
      );
      expect(mockPrisma.tournamentRoster.create).not.toHaveBeenCalled();
    });

    it('permits coaching staff already active on another team in the tournament', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.COACHING_STAFF, null);
      mockPrisma.tournamentRoster.findFirst.mockResolvedValueOnce(null); // same registration only
      mockPrisma.tournamentRoster.create.mockResolvedValue(activeRosterRow);

      await service.create(orgAdmin, {
        ...validCreateDto,
        role: RosterRole.COACHING_STAFF,
      });

      expect(mockPrisma.tournamentRoster.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tournamentRoster.create).toHaveBeenCalled();
    });

    it('copies the affiliation jersey number when omitted', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.ATHLETE, 9);
      mockPrisma.tournamentRoster.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.tournamentRoster.create.mockResolvedValue(activeRosterRow);

      await service.create(orgAdmin, validCreateDto);

      expect(mockPrisma.tournamentRoster.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ jerseyNumberSnapshot: 9 }),
        }),
      );
    });

    it('honors an explicit jersey override', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.ATHLETE, 9);
      mockPrisma.tournamentRoster.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.tournamentRoster.create.mockResolvedValue(activeRosterRow);

      await service.create(orgAdmin, { ...validCreateDto, jerseyNumber: 23 });

      expect(mockPrisma.tournamentRoster.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ jerseyNumberSnapshot: 23 }),
        }),
      );
    });

    it('honors an explicit null jersey override', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.ATHLETE, 9);
      mockPrisma.tournamentRoster.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.tournamentRoster.create.mockResolvedValue(activeRosterRow);

      await service.create(orgAdmin, {
        ...validCreateDto,
        jerseyNumber: null,
      });

      expect(mockPrisma.tournamentRoster.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ jerseyNumberSnapshot: null }),
        }),
      );
    });

    it('reactivates the same inactive roster id and preserves historical links', async () => {
      arrangeValidRegistration(TournamentStatus.REGISTRATION);
      arrangeEligibleMember(OrgRole.ATHLETE, 7);
      mockPrisma.tournamentRoster.findFirst
        .mockResolvedValueOnce({ id: 88, status: RosterStatus.INACTIVE })
        .mockResolvedValueOnce(null);
      mockPrisma.tournamentRoster.update.mockResolvedValue(activeRosterRow);

      await service.create(orgAdmin, validCreateDto);

      expect(mockPrisma.tournamentRoster.update).toHaveBeenCalledWith({
        where: { id: 88 },
        data: {
          organizationUserAffiliationId: 77,
          role: RosterRole.ATHLETE,
          jerseyNumberSnapshot: 7,
          status: RosterStatus.ACTIVE,
          leftAt: null,
        },
        select: expect.any(Object),
      });
      expect(mockPrisma.tournamentRoster.create).not.toHaveBeenCalled();
    });
  });
});
