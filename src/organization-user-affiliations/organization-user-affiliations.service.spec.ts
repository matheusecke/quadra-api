import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationUserAffiliationsService } from './organization-user-affiliations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AffiliationStatus, OrgRole } from '@prisma/client';

const mockPrisma = {
  organizationUserAffiliation: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  organizationTeamAffiliation: { findFirst: jest.fn() },
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

  describe('create()', () => {
    const orgId = 1;
    const currentUserId = 99;

    it('throws 404 if invited user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          orgId,
          { userId: 10, role: OrgRole.ATHLETE, teamId: 5 },
          currentUserId,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 409 if user already has PENDING or ACTIVE affiliation in org', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 10,
        isDeleted: false,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue({
        id: 99,
        status: 'PENDING',
      });
      await expect(
        service.create(
          orgId,
          { userId: 10, role: OrgRole.ORG_ADMIN },
          currentUserId,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('throws 422 if non-ORG_ADMIN role has no teamId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 10,
        isDeleted: false,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          orgId,
          { userId: 10, role: OrgRole.ATHLETE },
          currentUserId,
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('throws 422 if team is not ACTIVE in the org', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 10,
        isDeleted: false,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          orgId,
          { userId: 10, role: OrgRole.ATHLETE, teamId: 5 },
          currentUserId,
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('creates affiliation and returns raw invite token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 10,
        isDeleted: false,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.create.mockResolvedValue({
        id: 1,
        userId: 10,
        organizationId: orgId,
        role: OrgRole.ATHLETE,
        teamId: 5,
        jerseyNumber: null,
        status: AffiliationStatus.PENDING,
        createdByUserId: currentUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(
        orgId,
        { userId: 10, role: OrgRole.ATHLETE, teamId: 5 },
        currentUserId,
      );
      expect(result.inviteToken).toHaveLength(64);
      expect(result.affiliation.status).toBe(AffiliationStatus.PENDING);
      expect(
        mockPrisma.organizationUserAffiliation.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 10,
            role: OrgRole.ATHLETE,
            teamId: 5,
            status: AffiliationStatus.PENDING,
          }),
        }),
      );
    });

    it('allows ORG_ADMIN creation without teamId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 10,
        isDeleted: false,
        status: 'ACTIVE',
      });
      mockPrisma.organizationUserAffiliation.findFirst.mockResolvedValue(null);
      mockPrisma.organizationUserAffiliation.create.mockResolvedValue({
        id: 2,
        userId: 10,
        organizationId: orgId,
        role: OrgRole.ORG_ADMIN,
        teamId: null,
        jerseyNumber: null,
        status: AffiliationStatus.PENDING,
        createdByUserId: currentUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(
        orgId,
        { userId: 10, role: OrgRole.ORG_ADMIN },
        currentUserId,
      );
      expect(result.inviteToken).toHaveLength(64);
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
        },
      ]);
      const result = await service.findAll(1, { page: 1, limit: 10 });
      expect(result.count).toBe(1);
      expect(result.data).toHaveLength(1);
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
      });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
      });
      await service.respondToInvite(
        { token: rawToken, decision: 'ACCEPT' as any },
        5,
      );
      expect(
        mockPrisma.organizationUserAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
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
      await expect(service.update(1, 1, { role: OrgRole.ATHLETE })).rejects.toMatchObject({ status: 404 });
    });

    it('updates affiliation successfully', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1, status: 'ACTIVE', role: 'ATHLETE', teamId: 2,
      });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({ id: 1, status: 'ACTIVE' });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1, role: 'TEAM_ADMIN', teamId: 2, status: 'ACTIVE',
      });
      const result = await service.update(1, 1, { role: OrgRole.TEAM_ADMIN, teamId: 2 });
      expect(mockPrisma.organizationUserAffiliation.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('clears teamId and jerseyNumber when switching to ORG_ADMIN', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({
        id: 1, status: 'ACTIVE', role: 'ATHLETE', teamId: 2,
      });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({
        id: 1, role: 'ORG_ADMIN', teamId: null, jerseyNumber: null, status: 'ACTIVE',
      });
      await service.update(1, 1, { role: OrgRole.ORG_ADMIN });
      expect(mockPrisma.organizationUserAffiliation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ teamId: null, jerseyNumber: null }) }),
      );
    });
  });

  describe('resend()', () => {
    it('throws 404 if affiliation not found', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue(null);
      await expect(service.resend(1, 99)).rejects.toMatchObject({ status: 404 });
    });

    it('throws 422 if affiliation is not PENDING', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({ id: 1, status: 'ACTIVE' });
      await expect(service.resend(1, 1)).rejects.toMatchObject({ status: 422 });
    });

    it('regenerates token and returns raw token', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({ id: 1, status: 'PENDING' });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({ id: 1, status: 'PENDING' });
      const result = await service.resend(1, 1);
      expect(result.inviteToken).toHaveLength(64);
      expect(mockPrisma.organizationUserAffiliation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ inviteToken: expect.any(String), inviteExpiresAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('updateStatus()', () => {
    it('throws 404 if affiliation not found', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus(1, 99, { status: 'ACTIVE' as any })).rejects.toMatchObject({ status: 404 });
    });

    it('updates status', async () => {
      mockPrisma.organizationUserAffiliation.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.organizationUserAffiliation.update.mockResolvedValue({ id: 1, status: 'ACTIVE' });
      await service.updateStatus(1, 1, { status: 'ACTIVE' as any });
      expect(mockPrisma.organizationUserAffiliation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
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
