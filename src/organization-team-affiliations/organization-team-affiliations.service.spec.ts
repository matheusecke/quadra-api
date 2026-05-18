import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationTeamAffiliationsService } from './organization-team-affiliations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AffiliationStatus } from '@prisma/client';
import { InviteDecision } from './dto/team-invite-response.dto';

const mockPrisma = {
  organizationTeamAffiliation: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  team: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
};

describe('OrganizationTeamAffiliationsService', () => {
  let service: OrganizationTeamAffiliationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationTeamAffiliationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(OrganizationTeamAffiliationsService);
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const orgId = 1;
    const dto = { teamId: 2 };
    const currentUserId = 10;

    it('throws 404 if team does not exist', async () => {
      mockPrisma.team.findUnique.mockResolvedValue(null);
      await expect(
        service.create(orgId, dto, currentUserId),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 409 if team already has PENDING affiliation with org', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ id: 2, isDeleted: false });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 99,
        status: AffiliationStatus.PENDING,
      });
      await expect(
        service.create(orgId, dto, currentUserId),
      ).rejects.toMatchObject({
        status: 409,
      });
    });

    it('throws 409 if team already has ACTIVE affiliation with org', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ id: 2, isDeleted: false });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue({
        id: 99,
        status: AffiliationStatus.ACTIVE,
      });
      await expect(
        service.create(orgId, dto, currentUserId),
      ).rejects.toMatchObject({
        status: 409,
      });
    });

    it('creates affiliation and returns raw token', async () => {
      mockPrisma.team.findUnique.mockResolvedValue({ id: 2, isDeleted: false });
      mockPrisma.organizationTeamAffiliation.findFirst.mockResolvedValue(null);
      mockPrisma.organizationTeamAffiliation.create.mockResolvedValue({
        id: 1,
        organizationId: orgId,
        teamId: 2,
        status: AffiliationStatus.PENDING,
        createdByUserId: currentUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
        team: { id: 2, name: 'Equipe A' },
      });

      const result = await service.create(orgId, dto, currentUserId);
      expect(result.inviteToken).toHaveLength(64);
      expect(result.affiliation.status).toBe(AffiliationStatus.PENDING);
      expect(
        mockPrisma.organizationTeamAffiliation.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            teamId: dto.teamId,
            createdByUserId: currentUserId,
            status: AffiliationStatus.PENDING,
          }),
        }),
      );
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
          team: { id: 2, name: 'Equipe A' },
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
            team: { name: { contains: 'Lakers', mode: 'insensitive' } },
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

    it('queries prisma with a select that includes nested team', async () => {
      mockPrisma.organizationTeamAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationTeamAffiliation.findMany.mockResolvedValue([]);

      await service.findAll(1, { page: 1, limit: 20 });

      expect(
        mockPrisma.organizationTeamAffiliation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            team: { select: { id: true, name: true } },
          }),
        }),
      );
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

  describe('resend()', () => {
    it('throws 404 if affiliation not found', async () => {
      mockPrisma.organizationTeamAffiliation.findUnique.mockResolvedValue(null);
      await expect(service.resend(1, 99)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws 422 if affiliation is not PENDING', async () => {
      mockPrisma.organizationTeamAffiliation.findUnique.mockResolvedValue({
        id: 99,
        status: 'ACTIVE',
      });
      await expect(service.resend(1, 99)).rejects.toMatchObject({
        status: 422,
      });
    });

    it('regenerates token and returns raw token', async () => {
      mockPrisma.organizationTeamAffiliation.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
      });
      mockPrisma.organizationTeamAffiliation.update.mockResolvedValue({
        id: 1,
        status: 'PENDING',
      });
      const result = await service.resend(1, 1);
      expect(result.inviteToken).toHaveLength(64);
      expect(
        mockPrisma.organizationTeamAffiliation.update,
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

  describe('remove()', () => {
    it('throws 404 if affiliation not found', async () => {
      mockPrisma.organizationTeamAffiliation.findUnique.mockResolvedValue(null);
      await expect(service.remove(1, 99)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('soft deletes the affiliation', async () => {
      mockPrisma.organizationTeamAffiliation.findUnique.mockResolvedValue({
        id: 1,
        organizationId: 1,
      });
      mockPrisma.organizationTeamAffiliation.update.mockResolvedValue({
        id: 1,
        isDeleted: true,
      });
      await service.remove(1, 1);
      expect(
        mockPrisma.organizationTeamAffiliation.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDeleted: true }),
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
});
