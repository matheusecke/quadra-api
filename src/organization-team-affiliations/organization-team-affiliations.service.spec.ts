import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationTeamAffiliationsService } from './organization-team-affiliations.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AffiliationStatus,
  EntityStatus,
  OrgRole,
  Prisma,
} from '@prisma/client';
import { InviteDecision } from './dto/team-invite-response.dto';
import { ApiException } from '../common/exceptions/api.exception';
import { slugify } from '../common/utils/slugify';
import { OrganizationUserAffiliationsService } from '../organization-user-affiliations/organization-user-affiliations.service';

const mockPrisma = {
  organizationTeamAffiliation: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  organizationUserAffiliation: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  team: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  organization: { findUnique: jest.fn() },
  $transaction: jest.fn((callback: (tx: typeof mockPrisma) => unknown) =>
    callback(mockPrisma),
  ),
};

const mockUserAffiliations = {
  createPendingInvite: jest.fn(),
};

const apiErrorMessage = (error: unknown): string =>
  ((error as ApiException).getResponse() as { error: { message: string } })
    .error.message;

const apiErrorCode = (error: unknown): string | undefined =>
  ((error as ApiException).getResponse() as { error: { code?: string } }).error
    .code;

const activeTeam = (overrides: Record<string, unknown> = {}) => ({
  id: 8,
  name: 'Águias Campinas',
  shortName: 'AGC',
  city: 'Campinas',
  state: null,
  status: EntityStatus.ACTIVE,
  isDeleted: false,
  ...overrides,
});

const teamAffiliation = (overrides: Record<string, unknown> = {}) => ({
  id: 15,
  organizationId: 1,
  teamId: 8,
  status: AffiliationStatus.PENDING,
  createdByUserId: 99,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-01T12:00:00.000Z'),
  team: activeTeam(),
  ...overrides,
});

const pendingTeamAffiliation = (overrides: Record<string, unknown> = {}) =>
  teamAffiliation({ status: AffiliationStatus.PENDING, ...overrides });

const activeTeamAffiliation = (overrides: Record<string, unknown> = {}) =>
  teamAffiliation({ status: AffiliationStatus.ACTIVE, ...overrides });

const inactiveTeamAffiliation = (overrides: Record<string, unknown> = {}) =>
  teamAffiliation({ status: AffiliationStatus.INACTIVE, ...overrides });

const pendingAdminInviteBundle = (overrides: Record<string, unknown> = {}) => ({
  affiliation: {
    id: 31,
    organizationId: 1,
    userId: 42,
    role: OrgRole.TEAM_ADMIN,
    teamId: 8,
    jerseyNumber: null,
    position: null,
    status: AffiliationStatus.PENDING,
    inviteExpiresAt: new Date('2026-08-15T12:00:00.000Z'),
    user: { id: 42, name: 'Marina', email: 'marina@example.com' },
    team: { id: 8, name: 'Águias Campinas' },
  },
  inviteToken: 'a'.repeat(64),
  inviteExpiresAt: new Date('2026-08-15T12:00:00.000Z'),
  ...overrides,
});

const p2034Error = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or a deadlock.',
    { code: 'P2034', clientVersion: '7.7.0' },
  );

describe('OrganizationTeamAffiliationsService', () => {
  let service: OrganizationTeamAffiliationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationTeamAffiliationsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: OrganizationUserAffiliationsService,
          useValue: mockUserAffiliations,
        },
      ],
    }).compile();
    service = module.get(OrganizationTeamAffiliationsService);
    jest.clearAllMocks();
    // jest.clearAllMocks() clears call history but not implementations set via
    // mockResolvedValue/mockRejectedValue in a prior test; restore the default
    // pass-through so every test starts from the same $transaction behavior.
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
  });

  describe('composite team onboarding', () => {
    it.each([
      ['Águias', 'AGU'],
      ['Engenharia PUC', 'EPU'],
      ['São Paulo', 'SPA'],
      ['Equipe A', 'EQA'],
      ['São Paulo Futebol Clube', 'SPF'],
    ])('derives %s as %s for a new team', async (teamName, shortName) => {
      mockPrisma.team.findFirst.mockResolvedValue(null);
      mockPrisma.team.create.mockResolvedValue({
        id: 8,
        name: teamName,
        shortName,
      });
      mockPrisma.organizationTeamAffiliation.create.mockResolvedValue(
        pendingTeamAffiliation({ teamId: 8 }),
      );
      mockUserAffiliations.createPendingInvite.mockResolvedValue(
        pendingAdminInviteBundle(),
      );

      await service.create(1, { teamName, adminUserId: 42 }, 99);

      expect(mockPrisma.team.create).toHaveBeenCalledWith({
        data: {
          name: teamName,
          shortName,
          slug: slugify(teamName),
          city: null,
          state: null,
          status: EntityStatus.ACTIVE,
        },
        select: expect.any(Object),
      });
    });

    it.each([
      [{ adminUserId: 42 }, 'Exactly one of teamId or teamName is required'],
      [
        { teamId: 8, teamName: 'Águias', adminUserId: 42 },
        'Exactly one of teamId or teamName is required',
      ],
    ])('rejects an invalid selector %#', async (dto, message) => {
      const error = await service
        .create(1, dto, 99)
        .catch((caught: unknown) => caught);
      expect(apiErrorMessage(error)).toBe(message);
    });

    it.each([AffiliationStatus.PENDING, AffiliationStatus.ACTIVE])(
      'reuses a live %s team affiliation and adds another admin invite',
      async (status) => {
        mockPrisma.team.findFirst.mockResolvedValue(activeTeam({ id: 8 }));
        mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
          teamAffiliation({ id: 15, teamId: 8, status }),
        );
        mockUserAffiliations.createPendingInvite.mockResolvedValue(
          pendingAdminInviteBundle(),
        );

        const result = await service.create(
          1,
          { teamId: 8, adminUserId: 42 },
          99,
        );

        expect(
          mockPrisma.organizationTeamAffiliation.create,
        ).not.toHaveBeenCalled();
        expect(result.teamAffiliation.id).toBe(15);
      },
    );

    it('rejects a live inactive team affiliation without changing it', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(activeTeam({ id: 8 }));
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
        teamAffiliation({ teamId: 8, status: AffiliationStatus.INACTIVE }),
      );
      const error = await service
        .create(1, { teamId: 8, adminUserId: 42 }, 99)
        .catch((caught: unknown) => caught);
      expect(apiErrorMessage(error)).toBe(
        'Team affiliation is inactive; activate it before inviting users',
      );
    });

    it('creates the team link and admin invite in one serializable transaction', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(null);
      mockPrisma.team.create.mockResolvedValue(activeTeam({ id: 8 }));
      mockPrisma.organizationTeamAffiliation.create.mockResolvedValue(
        pendingTeamAffiliation({ teamId: 8 }),
      );
      mockUserAffiliations.createPendingInvite.mockResolvedValue(
        pendingAdminInviteBundle(),
      );
      await service.create(1, { teamName: 'Águias', adminUserId: 42 }, 99);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
      expect(mockUserAffiliations.createPendingInvite).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({ role: OrgRole.TEAM_ADMIN, teamId: 8 }),
      );
    });

    it('rejects an inactive or deleted existing global team with 404', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);
      await expect(
        service.create(1, { teamId: 8, adminUserId: 42 }, 99),
      ).rejects.toMatchObject({ status: 404 });
      expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
        where: { id: 8, status: EntityStatus.ACTIVE, isDeleted: false },
        select: expect.any(Object),
      });
    });

    it('returns 409 when a new-team slug already exists', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({ id: 9 });
      const error = await service
        .create(1, { teamName: 'Águias', adminUserId: 42 }, 99)
        .catch((caught: unknown) => caught);
      expect(apiErrorMessage(error)).toBe(
        'A team with this name already exists.',
      );
    });

    it('rejects a punctuation-only team name', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);
      const error = await service
        .create(1, { teamName: '---', adminUserId: 42 }, 99)
        .catch((caught: unknown) => caught);
      expect(apiErrorMessage(error)).toBe(
        'Team name must contain an alphanumeric character',
      );
      expect(mockPrisma.team.create).not.toHaveBeenCalled();
    });

    it('retries one P2034 and returns the next successful transaction', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034Error())
        .mockImplementationOnce((callback) => callback(mockPrisma));
      mockPrisma.team.findFirst.mockResolvedValue(null);
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(null);
      mockPrisma.team.create.mockResolvedValue(activeTeam());
      mockPrisma.organizationTeamAffiliation.create.mockResolvedValue(
        pendingTeamAffiliation(),
      );
      mockUserAffiliations.createPendingInvite.mockResolvedValue(
        pendingAdminInviteBundle(),
      );

      await expect(
        service.create(1, { teamName: 'Águias', adminUserId: 42 }, 99),
      ).resolves.toMatchObject({ teamAffiliation: { id: 15 } });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('returns CONCURRENT_MODIFICATION after four P2034 conflicts', async () => {
      mockPrisma.$transaction.mockRejectedValue(p2034Error());
      const error = await service
        .create(1, { teamId: 8, adminUserId: 42 }, 99)
        .catch((caught: unknown) => caught);
      expect((error as ApiException).getStatus()).toBe(409);
      expect(apiErrorCode(error)).toBe('CONCURRENT_MODIFICATION');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(4);
    });
  });

  describe('findAll()', () => {
    it('returns paginated affiliations for org', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(1);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          teamId: 2,
          status: 'ACTIVE',
          createdByUserId: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
          team: { id: 2, name: 'Equipe A', userAffiliations: [] },
        },
      ]);
      const result = await service.findAll(1, { page: 1, limit: 10 });
      expect(result.count).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('applies status filter when provided', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(1, {
        page: 1,
        limit: 10,
        status: 'PENDING' as any,
      });
      expect(
        mockPrisma.organizationTeamAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('applies team name filter when q is provided', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(1, { page: 1, limit: 10, q: 'Lakers' });
      expect(
        mockPrisma.organizationTeamAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            team: { is: { name: { contains: 'Lakers', mode: 'insensitive' } } },
          }),
        }),
      );
    });

    it('does not apply team filter when q is absent', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(1, { page: 1, limit: 10 });
      const callWhere =
        mockPrisma.organizationTeamAffiliation.findMany.mock.calls[0][0].where;
      expect(callWhere.team).toBeUndefined();
    });

    it('includes PENDING status and inviteExpiresAt lt filter when inviteExpired=true', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(1, { page: 1, limit: 10, inviteExpired: true });
      const callWhere =
        mockPrisma.organizationTeamAffiliation.findMany.mock.calls[0][0].where;
      expect(callWhere.status).toBe('PENDING');
      expect(callWhere.inviteExpiresAt).toEqual({ lt: expect.any(Date) });
    });

    it('does not include inviteExpiresAt in where when inviteExpired is absent', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(1, { page: 1, limit: 10 });
      const callWhere =
        mockPrisma.organizationTeamAffiliation.findMany.mock.calls[0][0].where;
      expect(callWhere.inviteExpiresAt).toBeUndefined();
    });
  });

  describe('findById()', () => {
    it('throws 404 if not found', async () => {
      mockPrisma.organizationTeamAffiliation.findUnique.mockResolvedValue(null);
      await expect(service.findById(1, 99)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('returns affiliation when found', async () => {
      const aff = {
        id: 1,
        organizationId: 1,
        teamId: 2,
        status: 'ACTIVE',
        createdByUserId: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        team: { id: 2, name: 'Equipe A' },
      };
      mockPrisma.organizationTeamAffiliation.findUnique.mockResolvedValue(aff);
      const result = await service.findById(1, 1);
      expect(result).toEqual(aff);
    });
  });

  describe('respondToInvite()', () => {
    const rawToken = 'a'.repeat(64);

    it('throws 404 if token hash not found', async () => {
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(null);
      await expect(
        service.respondToInvite({ token: rawToken, decision: 'ACCEPT' as any }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 422 if invite expired', async () => {
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.respondToInvite({ token: rawToken, decision: 'ACCEPT' as any }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('throws 422 if affiliation is not PENDING', async () => {
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        inviteExpiresAt: new Date(Date.now() + 99999),
      });
      await expect(
        service.respondToInvite({ token: rawToken, decision: 'ACCEPT' as any }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('sets status ACTIVE on ACCEPT', async () => {
      const aff = {
        id: 1,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 99999),
      };
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(aff);
      mockPrisma.organizationTeamAffiliation.update.mockResolvedValue({
        ...aff,
        status: 'ACTIVE',
        inviteToken: null,
        inviteExpiresAt: null,
      });
      await service.respondToInvite({
        token: rawToken,
        decision: InviteDecision.ACCEPT,
      });
      expect(
        mockPrisma.organizationTeamAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
            inviteToken: null,
          }),
        }),
      );
    });

    it('soft deletes on REJECT', async () => {
      const aff = {
        id: 1,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 99999),
      };
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(aff);
      mockPrisma.organizationTeamAffiliation.update.mockResolvedValue({
        ...aff,
        isDeleted: true,
      });
      await service.respondToInvite({
        token: rawToken,
        decision: InviteDecision.REJECT,
      });
      expect(
        mockPrisma.organizationTeamAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDeleted: true, inviteToken: null }),
        }),
      );
    });
  });

  describe('updateStatus()', () => {
    it('updates status by system admin', async () => {
      mockPrisma.organizationTeamAffiliation.findUnique.mockResolvedValue({
        id: 1,
      });
      mockPrisma.organizationTeamAffiliation.update.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });
      await service.updateStatus(1, 1, { status: 'ACTIVE' as any });
      expect(
        mockPrisma.organizationTeamAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });
  });

  describe('findByTeam()', () => {
    it('returns paginated affiliations for a team', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(2);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([
        {
          id: 1,
          organizationId: 1,
          teamId: 5,
          status: 'ACTIVE',
          createdByUserId: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
          team: { id: 5, name: 'Equipe A' },
        },
        {
          id: 2,
          organizationId: 2,
          teamId: 5,
          status: 'PENDING',
          createdByUserId: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
          team: { id: 5, name: 'Equipe A' },
        },
      ]);
      const result = await service.findByTeam(5, { page: 1, limit: 10 });
      expect(result.count).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('applies organization name filter when q is provided', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findByTeam(5, { page: 1, limit: 10, q: 'NBA' });
      expect(
        mockPrisma.organizationTeamAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization: { name: { contains: 'NBA', mode: 'insensitive' } },
          }),
        }),
      );
    });

    it('does not apply organization filter when q is absent', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findByTeam(5, { page: 1, limit: 10 });
      const callWhere =
        mockPrisma.organizationTeamAffiliation.findMany.mock.calls[0][0].where;
      expect(callWhere.organization).toBeUndefined();
    });

    it('includes PENDING status and inviteExpiresAt lt filter when inviteExpired=true', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findByTeam(5, { page: 1, limit: 10, inviteExpired: true });
      const callWhere =
        mockPrisma.organizationTeamAffiliation.findMany.mock.calls[0][0].where;
      expect(callWhere.status).toBe('PENDING');
      expect(callWhere.inviteExpiresAt).toEqual({ lt: expect.any(Date) });
    });

    it('does not include inviteExpiresAt in where when inviteExpired is absent', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findByTeam(5, { page: 1, limit: 10 });
      const callWhere =
        mockPrisma.organizationTeamAffiliation.findMany.mock.calls[0][0].where;
      expect(callWhere.inviteExpiresAt).toBeUndefined();
    });
  });

  describe('team affiliation management read model', () => {
    it('maps live active-user and pending-admin counts from one paginated query', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(1);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([
        teamAffiliation({
          team: activeTeam({
            userAffiliations: [
              { status: AffiliationStatus.ACTIVE, role: OrgRole.ATHLETE },
              { status: AffiliationStatus.ACTIVE, role: OrgRole.TEAM_ADMIN },
              { status: AffiliationStatus.PENDING, role: OrgRole.TEAM_ADMIN },
            ],
          }),
        }),
      ]);

      await expect(service.findAll(1, { page: 1, limit: 20 })).resolves.toEqual(
        {
          count: 1,
          data: [
            expect.objectContaining({
              activeUserCount: 2,
              pendingAdminInviteCount: 1,
            }),
          ],
        },
      );
      expect(
        mockPrisma.organizationTeamAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            team: {
              select: expect.objectContaining({
                userAffiliations: {
                  where: {
                    organizationId: 1,
                    isDeleted: false,
                    user: {
                      is: { status: EntityStatus.ACTIVE, isDeleted: false },
                    },
                    OR: [
                      { status: AffiliationStatus.ACTIVE },
                      {
                        status: AffiliationStatus.PENDING,
                        role: OrgRole.TEAM_ADMIN,
                      },
                    ],
                  },
                  select: { status: true, role: true },
                },
              }),
            },
          }),
        }),
      );
    });
  });

  describe('team affiliation lifecycle', () => {
    it('rotates every and only pending team-admin user invite', async () => {
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
        pendingTeamAffiliation({ id: 15, teamId: 8 }),
      );
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        { id: 31 },
        { id: 32 },
      ]);
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.resend(1, 15);

      expect(result.invites).toHaveLength(2);
      expect(
        new Set(result.invites.map(({ inviteToken }) => inviteToken)).size,
      ).toBe(2);
      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledTimes(2);
    });

    it('cancels all pending admins and deletes an onboarding-only global team', async () => {
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
        pendingTeamAffiliation({ id: 15, teamId: 8 }),
      );
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);

      await service.remove(1, 15);

      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          organizationId: 1,
          teamId: 8,
          role: OrgRole.TEAM_ADMIN,
          status: AffiliationStatus.PENDING,
          isDeleted: false,
        },
        data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
      });
      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: 8 },
        data: { isDeleted: true, status: EntityStatus.INACTIVE },
      });
    });

    it('preserves the global team when any other affiliation history exists', async () => {
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
        pendingTeamAffiliation({ id: 15, teamId: 8 }),
      );
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(1);
      await service.remove(1, 15);
      expect(mockPrisma.organizationTeamAffiliation.count).toHaveBeenCalledWith(
        {
          where: { teamId: 8, id: { not: 15 } },
        },
      );
      expect(mockPrisma.team.update).not.toHaveBeenCalled();
    });

    it('deactivates the team link, active members, and pending invites atomically', async () => {
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
        activeTeamAffiliation({ id: 15, teamId: 8 }),
      );
      await service.deactivate(1, 15);
      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: { status: AffiliationStatus.INACTIVE },
        }),
      );
      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: { isDeleted: true, inviteToken: null, inviteExpiresAt: null },
        }),
      );
    });

    it('activates only the team link and leaves user rows untouched', async () => {
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
        inactiveTeamAffiliation({ id: 15, teamId: 8 }),
      );
      mockPrisma.team.findFirst.mockResolvedValue(activeTeam({ id: 8 }));
      await service.activate(1, 15);
      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).not.toHaveBeenCalled();
    });

    it.each([
      [
        'resend',
        () => service.resend(1, 15),
        AffiliationStatus.ACTIVE,
        'PENDING',
      ],
      [
        'cancel',
        () => service.remove(1, 15),
        AffiliationStatus.ACTIVE,
        'PENDING',
      ],
      [
        'deactivate',
        () => service.deactivate(1, 15),
        AffiliationStatus.INACTIVE,
        'ACTIVE',
      ],
      [
        'activate',
        () => service.activate(1, 15),
        AffiliationStatus.ACTIVE,
        'INACTIVE',
      ],
    ] as const)(
      'requires the exact source status to %s',
      async (_action, invoke, currentStatus, requiredStatus) => {
        mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
          teamAffiliation({ status: currentStatus }),
        );
        const error = await invoke().catch((caught: unknown) => caught);
        expect(apiErrorMessage(error)).toContain(
          `Team affiliation must be ${requiredStatus}`,
        );
        expect(
          mockPrisma.organizationTeamAffiliation.update,
        ).not.toHaveBeenCalled();
        expect(
          mockPrisma.organizationUserAffiliation.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['resend', () => service.resend(1, 15)],
      ['cancel', () => service.remove(1, 15)],
      ['deactivate', () => service.deactivate(1, 15)],
      ['activate', () => service.activate(1, 15)],
    ] as const)(
      'throws 404 when the affiliation is missing for %s',
      async (_action, invoke) => {
        mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
          null,
        );
        const error = await invoke().catch((caught: unknown) => caught);
        expect((error as ApiException).getStatus()).toBe(404);
        expect(apiErrorMessage(error)).toBe('Affiliation not found');
        expect(
          mockPrisma.organizationTeamAffiliation.update,
        ).not.toHaveBeenCalled();
        expect(
          mockPrisma.organizationUserAffiliation.updateMany,
        ).not.toHaveBeenCalled();
        expect(mockPrisma.team.update).not.toHaveBeenCalled();
      },
    );

    it('treats expiry as a read filter and performs no cancellation or B1 write', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(1, { page: 1, limit: 20, inviteExpired: true });
      expect(
        mockPrisma.organizationTeamAffiliation.update,
      ).not.toHaveBeenCalled();
      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).not.toHaveBeenCalled();
      expect(mockPrisma.organizationTeamAffiliation.count).toHaveBeenCalledWith(
        {
          where: expect.objectContaining({
            status: AffiliationStatus.PENDING,
            inviteExpiresAt: { lt: expect.any(Date) },
          }),
        },
      );
      expect(mockPrisma.team.update).not.toHaveBeenCalled();
    });

    it('retries the whole deactivate transaction after P2034', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034Error())
        .mockImplementationOnce((callback) => callback(mockPrisma));
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(
        activeTeamAffiliation(),
      );
      mockPrisma.organizationTeamAffiliation.update.mockResolvedValue(
        inactiveTeamAffiliation(),
      );
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });
      await expect(service.deactivate(1, 15)).resolves.toMatchObject({
        status: AffiliationStatus.INACTIVE,
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
