import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationUserAffiliationsService } from './organization-user-affiliations.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AffiliationStatus,
  BasketballPosition,
  EntityStatus,
  OrgRole,
} from '@prisma/client';
import { InviteDecision } from './dto/user-invite-response.dto';
import { ApiException } from '../common/exceptions/api.exception';
import { HttpStatus } from '@nestjs/common';

const apiErrorMessage = (error: unknown): string =>
  ((error as ApiException).getResponse() as { error: { message: string } })
    .error.message;

const affiliationFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  userId: 10,
  organizationId: 1,
  role: OrgRole.ATHLETE,
  teamId: 8,
  jerseyNumber: 12,
  position: BasketballPosition.PG,
  status: AffiliationStatus.ACTIVE,
  inviteExpiresAt: null,
  isDeleted: false,
  createdByUserId: 99,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-01T12:00:00.000Z'),
  user: { id: 10, name: 'Marina', email: 'marina@example.com' },
  team: { id: 8, name: 'Águias Campinas' },
  ...overrides,
});

const activeAffiliation = (overrides: Record<string, unknown> = {}) =>
  affiliationFixture({ status: AffiliationStatus.ACTIVE, ...overrides });

const inactiveAffiliation = (overrides: Record<string, unknown> = {}) =>
  affiliationFixture({ status: AffiliationStatus.INACTIVE, ...overrides });

const pendingAffiliation = (overrides: Record<string, unknown> = {}) =>
  affiliationFixture({
    status: AffiliationStatus.PENDING,
    inviteExpiresAt: new Date('2026-08-15T12:00:00.000Z'),
    ...overrides,
  });

const mockPrisma = {
  organizationUserAffiliation: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: { findFirst: jest.fn() },
  organizationTeamAffiliation: {
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  team: { findFirst: jest.fn(), update: jest.fn() },
  $transaction: jest.fn((callback: (tx: typeof mockPrisma) => unknown) =>
    callback(mockPrisma),
  ),
};

describe('OrganizationUserAffiliationsService', () => {
  let service: OrganizationUserAffiliationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationUserAffiliationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(OrganizationUserAffiliationsService);
    jest.clearAllMocks();
  });

  describe('role-specific invite creation', () => {
    it('creates only ORG_ADMIN from the top-level endpoint contract', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);
      mockPrisma.organizationUserAffiliation.create.mockResolvedValue({
        id: 1,
        userId: 10,
        organizationId: 1,
        role: OrgRole.ORG_ADMIN,
        teamId: null,
        jerseyNumber: null,
        position: null,
        status: AffiliationStatus.PENDING,
        inviteExpiresAt: new Date('2026-08-15T12:00:00.000Z'),
        user: { id: 10, name: 'Marina', email: 'marina@example.com' },
        team: null,
      });

      const result = await service.createOrganizationAdmin(1, 10, 99);

      expect(result.inviteToken).toHaveLength(64);
      expect(result.inviteExpiresAt).toBeInstanceOf(Date);
      expect(
        mockPrisma.organizationUserAffiliation.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: OrgRole.ORG_ADMIN,
            teamId: null,
            jerseyNumber: null,
            position: null,
          }),
        }),
      );
    });

    it.each([
      [AffiliationStatus.ACTIVE, 'User already has an active affiliation'],
      [AffiliationStatus.PENDING, 'User already has a pending invite'],
    ] as const)(
      'returns the stable conflict for %s',
      async (status, message) => {
        mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
        mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
          { id: 4, status },
        ]);

        const error = await service
          .createOrganizationAdmin(1, 10, 99)
          .catch((caught: unknown) => caught as ApiException);
        expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(apiErrorMessage(error)).toBe(message);
      },
    );

    it('soft-deletes every live inactive row before creating one pending invite', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        { id: 4, status: AffiliationStatus.INACTIVE },
        { id: 5, status: AffiliationStatus.INACTIVE },
      ]);
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 2,
      });
      mockPrisma.organizationUserAffiliation.create.mockResolvedValue({
        id: 6,
      });

      await service.createOrganizationAdmin(1, 10, 99);

      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          id: { in: [4, 5] },
          status: AffiliationStatus.INACTIVE,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('creates an athlete only for an active own-team admin and active team link', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        id: 30,
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 15,
      });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);
      mockPrisma.organizationUserAffiliation.create.mockResolvedValue({
        id: 6,
      });

      await service.createTeamMember(
        1,
        8,
        {
          userId: 10,
          role: OrgRole.ATHLETE,
          jerseyNumber: 12,
          position: BasketballPosition.PG,
        },
        99,
      );

      expect(
        mockPrisma.organizationUserAffiliation.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: OrgRole.ATHLETE,
            teamId: 8,
            jerseyNumber: 12,
            position: BasketballPosition.PG,
          }),
        }),
      );
    });

    it('rejects an athlete without jersey number or position', async () => {
      await expect(
        service.createTeamMember(
          1,
          8,
          { userId: 10, role: OrgRole.ATHLETE },
          99,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('findAll()', () => {
    it('returns paginated affiliations', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(1);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 5,
          organizationId: 1,
          role: 'ATHLETE',
          teamId: 2,
          jerseyNumber: 10,
          status: 'ACTIVE',
          createdByUserId: 99,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 5, name: 'Test User', email: 'test@example.com' },
          team: { id: 2, name: 'Equipe A' },
        },
      ]);
      const result = await service.findAll(
        1,
        { page: 1, limit: 10 },
        { userId: 99, role: OrgRole.ORG_ADMIN },
      );
      expect(result.count).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('includes user OR filter when q is provided', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(
        1,
        { page: 1, limit: 10, q: 'john' },
        { userId: 99, role: OrgRole.ORG_ADMIN },
      );
      const where =
        mockPrisma.organizationUserAffiliation.findMany.mock.calls[0][0].where;
      expect(where.user).toEqual({
        is: {
          OR: [
            { name: { contains: 'john', mode: 'insensitive' } },
            { email: { contains: 'john', mode: 'insensitive' } },
          ],
        },
      });
    });

    it('does not include user key when q is not provided', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(
        1,
        { page: 1, limit: 10 },
        { userId: 99, role: OrgRole.ORG_ADMIN },
      );
      const where =
        mockPrisma.organizationUserAffiliation.findMany.mock.calls[0][0].where;
      expect(where.user).toBeUndefined();
    });

    it('includes PENDING status and inviteExpiresAt lt filter when inviteExpired=true', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(
        1,
        { page: 1, limit: 10, inviteExpired: true },
        { userId: 99, role: OrgRole.ORG_ADMIN },
      );
      const where =
        mockPrisma.organizationUserAffiliation.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PENDING');
      expect(where.inviteExpiresAt).toEqual({ lt: expect.any(Date) });
    });

    it('does not include inviteExpiresAt in where when inviteExpired is absent', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);
      await service.findAll(
        1,
        { page: 1, limit: 10 },
        { userId: 99, role: OrgRole.ORG_ADMIN },
      );
      const where =
        mockPrisma.organizationUserAffiliation.findMany.mock.calls[0][0].where;
      expect(where.inviteExpiresAt).toBeUndefined();
    });

    it('queries prisma with a select that includes nested user and team', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(1);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      await service.findAll(
        1,
        { page: 1, limit: 20 },
        { userId: 99, role: OrgRole.ORG_ADMIN },
      );

      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            user: { select: { id: true, name: true, email: true } },
            team: { select: { id: true, name: true } },
          }),
        }),
      );
    });
  });

  describe('findAll by organization actor', () => {
    it('lets an org admin filter the entire organization', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(1);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        pendingAffiliation({ userId: 10, inviteExpiresAt: new Date('2026-08-01') }),
      ]);

      const result = await service.findAll(
        1,
        { page: 1, limit: 20, teamId: 8 },
        { userId: 99, role: OrgRole.ORG_ADMIN },
      );

      expect(mockPrisma.organizationUserAffiliation.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ organizationId: 1, teamId: 8 }),
      });
      expect(result.data[0]).toMatchObject({
        isInviteExpired: true,
        canManage: true,
      });
    });

    it('forces a team admin to their active own team and keeps co-admins read-only', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        teamId: 8,
      });
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(2);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        activeAffiliation({
          id: 20,
          userId: 77,
          teamId: 8,
          role: OrgRole.TEAM_ADMIN,
        }),
        activeAffiliation({ id: 21, userId: 55, teamId: 8, role: OrgRole.ATHLETE }),
      ]);

      const result = await service.findAll(
        1,
        { page: 1, limit: 20, teamId: 999 },
        { userId: 77, role: OrgRole.TEAM_ADMIN },
      );

      expect(mockPrisma.organizationUserAffiliation.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ organizationId: 1, teamId: 8 }),
      });
      expect(result.data.map(({ canManage }) => canManage)).toEqual([false, true]);
    });

    it('rejects a team-admin token without a matching active team-admin row', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);
      const error = await service
        .findAll(
          1,
          { page: 1, limit: 20 },
          { userId: 77, role: OrgRole.TEAM_ADMIN },
        )
        .catch((caught: unknown) => caught);
      expect(apiErrorMessage(error)).toBe(
        'You can only manage users from your own team',
      );
    });
  });

  describe('findById()', () => {
    it('throws 404 if not found', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue(null);
      await expect(service.findById(1, 99)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('respondToInvite()', () => {
    const rawToken = 'b'.repeat(64);

    it('throws 404 if token not found', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);
      await expect(
        service.respondToInvite(
          { token: rawToken, decision: 'ACCEPT' as any },
          5,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 403 if responding user is not the invited user', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        id: 1,
        userId: 10,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 99999),
      });
      await expect(
        service.respondToInvite(
          { token: rawToken, decision: 'ACCEPT' as any },
          99,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('sets status ACTIVE on ACCEPT', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        id: 1,
        userId: 5,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 99999),
        isDeleted: false,
      });
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });
      await service.respondToInvite(
        { token: rawToken, decision: 'ACCEPT' as any },
        5,
      );
      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('token accept clears inviteToken and inviteExpiresAt', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        id: 1,
        userId: 5,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 99999),
        isDeleted: false,
      });
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });

      await service.respondToInvite(
        { token: rawToken, decision: 'ACCEPT' as any },
        5,
      );

      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inviteToken: null,
            inviteExpiresAt: null,
          }),
        }),
      );
    });

    it('token reject sets isDeleted true and clears inviteToken and inviteExpiresAt', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        id: 1,
        userId: 5,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() + 99999),
        isDeleted: false,
      });
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        isDeleted: true,
      });

      await service.respondToInvite(
        { token: rawToken, decision: 'REJECT' as any },
        5,
      );

      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isDeleted: true,
            inviteToken: null,
            inviteExpiresAt: null,
          }),
        }),
      );
    });

    it('expired token accept still throws 422', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        id: 1,
        userId: 5,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() - 1000),
        isDeleted: false,
      });

      await expect(
        service.respondToInvite(
          { token: rawToken, decision: 'ACCEPT' as any },
          5,
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('expired token reject still throws 422', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        id: 1,
        userId: 5,
        status: 'PENDING',
        inviteExpiresAt: new Date(Date.now() - 1000),
        isDeleted: false,
      });

      await expect(
        service.respondToInvite(
          { token: rawToken, decision: 'REJECT' as any },
          5,
        ),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('update()', () => {
    it('throws 422 when setting non-ORG_ADMIN role without teamId', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        role: 'ATHLETE',
        teamId: 2,
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(null);
      await expect(
        service.update(1, 1, { role: OrgRole.TEAM_ADMIN, teamId: null }),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('update() additional', () => {
    it('throws 404 if active affiliation not found', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue(null);
      await expect(
        service.update(1, 1, { role: OrgRole.ATHLETE }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('updates affiliation successfully', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        role: 'ATHLETE',
        teamId: 2,
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1,
        role: 'TEAM_ADMIN',
        teamId: 2,
        status: 'ACTIVE',
      });
      const result = await service.update(1, 1, {
        role: OrgRole.TEAM_ADMIN,
        teamId: 2,
      });
      expect(mockPrisma.organizationUserAffiliation.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('clears teamId and jerseyNumber when switching to ORG_ADMIN', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        role: 'ATHLETE',
        teamId: 2,
      });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1,
        role: 'ORG_ADMIN',
        teamId: null,
        jerseyNumber: null,
        status: 'ACTIVE',
      });
      await service.update(1, 1, { role: OrgRole.ORG_ADMIN });
      expect(
        mockPrisma.organizationUserAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ teamId: null, jerseyNumber: null }),
        }),
      );
    });
  });

  describe('resend()', () => {
    it('throws 404 if affiliation not found', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue(null);
      await expect(service.resend(1, 99)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 422 if affiliation is not PENDING', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });
      await expect(service.resend(1, 1)).rejects.toMatchObject({ status: 422 });
    });

    it('regenerates token and returns raw token', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
      });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1,
        status: 'PENDING',
      });
      const result = await service.resend(1, 1);
      expect(result.inviteToken).toHaveLength(64);
      expect(
        mockPrisma.organizationUserAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inviteToken: expect.any(String),
            inviteExpiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('updateStatus()', () => {
    it('throws 404 if affiliation not found', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus(1, 99, { status: 'ACTIVE' as any }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('updates status', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
      });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });
      await service.updateStatus(1, 1, { status: 'ACTIVE' as any });
      expect(
        mockPrisma.organizationUserAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });
  });

  describe('findPendingInvitesForUser()', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('queries only pending non-deleted invites for the current active user with active organization and active-or-null team', async () => {
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      await service.findPendingInvitesForUser(5);

      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).toHaveBeenCalledWith({
        where: {
          userId: 5,
          status: AffiliationStatus.PENDING,
          isDeleted: false,
          user: { is: { isDeleted: false, status: EntityStatus.ACTIVE } },
          organization: {
            is: { isDeleted: false, status: EntityStatus.ACTIVE },
          },
          OR: [
            { teamId: null },
            { team: { is: { isDeleted: false, status: EntityStatus.ACTIVE } } },
          ],
        },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('does not select inviteToken for inbox listing', async () => {
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      await service.findPendingInvitesForUser(5);

      const select =
        mockPrisma.organizationUserAffiliation.findMany.mock.calls[0][0].select;
      expect(select.inviteToken).toBeUndefined();
    });

    it('maps organization/team display fields and computes expiration', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-19T12:00:00.000Z'));
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 5,
          organizationId: 10,
          role: OrgRole.ATHLETE,
          teamId: 3,
          jerseyNumber: 12,
          status: AffiliationStatus.PENDING,
          createdAt: new Date('2026-06-18T10:00:00.000Z'),
          inviteExpiresAt: new Date('2026-06-18T12:00:00.000Z'),
          organization: { id: 10, name: 'Club A' },
          team: { id: 3, name: 'U20' },
        },
        {
          id: 2,
          userId: 5,
          organizationId: 11,
          role: OrgRole.ORG_ADMIN,
          teamId: null,
          jerseyNumber: null,
          status: AffiliationStatus.PENDING,
          createdAt: new Date('2026-06-19T10:00:00.000Z'),
          inviteExpiresAt: new Date('2026-06-20T12:00:00.000Z'),
          organization: { id: 11, name: 'Club B' },
          team: null,
        },
      ]);

      const result = await service.findPendingInvitesForUser(5);

      expect(result).toEqual([
        {
          id: 1,
          organizationId: 10,
          organizationName: 'Club A',
          role: OrgRole.ATHLETE,
          teamId: 3,
          teamName: 'U20',
          jerseyNumber: 12,
          status: AffiliationStatus.PENDING,
          sentAt: '2026-06-18T10:00:00.000Z',
          expiresAt: '2026-06-18T12:00:00.000Z',
          isExpired: true,
        },
        {
          id: 2,
          organizationId: 11,
          organizationName: 'Club B',
          role: OrgRole.ORG_ADMIN,
          teamId: null,
          teamName: null,
          jerseyNumber: null,
          status: AffiliationStatus.PENDING,
          sentAt: '2026-06-19T10:00:00.000Z',
          expiresAt: '2026-06-20T12:00:00.000Z',
          isExpired: false,
        },
      ]);
    });
  });

  describe('respondToInviteForUser()', () => {
    const pendingAffiliation = {
      id: 1,
      userId: 5,
      organizationId: 10,
      role: OrgRole.ATHLETE,
      teamId: 3,
      jerseyNumber: 12,
      status: AffiliationStatus.PENDING,
      inviteExpiresAt: new Date(Date.now() + 99999),
      isDeleted: false,
    };

    const updatedAffiliation = {
      id: 1,
      userId: 5,
      organizationId: 10,
      role: OrgRole.ATHLETE,
      teamId: 3,
      jerseyNumber: 12,
      status: AffiliationStatus.ACTIVE,
      createdAt: new Date('2026-06-19T10:00:00.000Z'),
      inviteExpiresAt: null,
      organization: { id: 10, name: 'Club A' },
      team: { id: 3, name: 'U20' },
    };

    it('accepts pending valid invite and writes status ACTIVE, inviteToken null, inviteExpiresAt null', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(
        pendingAffiliation,
      );
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.respondToInviteForUser(5, 1, InviteDecision.ACCEPT);

      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AffiliationStatus.ACTIVE,
            inviteToken: null,
            inviteExpiresAt: null,
          }),
        }),
      );
    });

    it('rejects pending valid invite and writes isDeleted true, inviteToken null, inviteExpiresAt null', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(
        pendingAffiliation,
      );
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.respondToInviteForUser(5, 1, InviteDecision.REJECT);

      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isDeleted: true,
            inviteToken: null,
            inviteExpiresAt: null,
          }),
        }),
      );
    });

    it('blocks accepting expired pending invite with 422', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        ...pendingAffiliation,
        inviteExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.respondToInviteForUser(5, 1, InviteDecision.ACCEPT),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('allows rejecting expired pending invite', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        ...pendingAffiliation,
        inviteExpiresAt: new Date(Date.now() - 1000),
      });
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        service.respondToInviteForUser(5, 1, InviteDecision.REJECT),
      ).resolves.toBeUndefined();
    });

    it('queries with pending status, active user, active organization, and active-or-null team', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);

      await service
        .respondToInviteForUser(5, 1, InviteDecision.ACCEPT)
        .catch(() => {});

      expect(
        mockPrisma.organizationUserAffiliation.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          id: 1,
          userId: 5,
          status: AffiliationStatus.PENDING,
          isDeleted: false,
          user: { is: { isDeleted: false, status: EntityStatus.ACTIVE } },
          organization: {
            is: { isDeleted: false, status: EntityStatus.ACTIVE },
          },
          OR: [
            { teamId: null },
            { team: { is: { isDeleted: false, status: EntityStatus.ACTIVE } } },
          ],
        },
        select: expect.any(Object),
      });
    });

    it('returns 404 for missing, deleted, other-user, or non-pending invite', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);

      await expect(
        service.respondToInviteForUser(5, 99, InviteDecision.ACCEPT),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('uses updateMany with id, userId, status PENDING, isDeleted false', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(
        pendingAffiliation,
      );
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.respondToInviteForUser(5, 1, InviteDecision.ACCEPT);

      expect(
        mockPrisma.organizationUserAffiliation.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 1,
            userId: 5,
            status: AffiliationStatus.PENDING,
            isDeleted: false,
          },
        }),
      );
    });

    it('returns 422 when updateMany returns count 0 (double-submit)', async () => {
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(
        pendingAffiliation,
      );
      mockPrisma.organizationUserAffiliation.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.respondToInviteForUser(5, 1, InviteDecision.ACCEPT),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('remove()', () => {
    it('throws 422 if ORG_ADMIN tries to remove themselves', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        userId: 99,
      });
      await expect(service.remove(1, 1, 99, false)).rejects.toMatchObject({
        status: 422,
      });
    });

    it('soft deletes if user is different from admin', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
      });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1,
        isDeleted: true,
      });
      await service.remove(1, 1, 99, false);
      expect(
        mockPrisma.organizationUserAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDeleted: true }),
        }),
      );
    });

    it('system admin can remove any affiliation (including self)', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1,
        userId: 99,
      });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1,
        isDeleted: true,
      });
      await service.remove(1, 1, 99, true);
      expect(mockPrisma.organizationUserAffiliation.update).toHaveBeenCalled();
    });
  });
});
