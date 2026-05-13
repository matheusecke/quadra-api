import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { EntityStatus, OrgRole } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const mockPrisma: any = {
  organization: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    updateMany: jest.fn(),
  },
};
mockPrisma.$transaction = jest.fn((ops: unknown[]) => Promise.all(ops));

const baseOrg = {
  id: 1,
  name: 'São Paulo FC',
  slug: 'sao-paulo-fc',
  status: EntityStatus.ACTIVE,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const systemAdmin: JwtPayload = {
  sub: 99,
  email: 'admin@example.com',
  isSystemAdmin: true,
  organizationId: null,
  role: null,
};

const orgAdmin: JwtPayload = {
  sub: 10,
  email: 'orgadmin@example.com',
  isSystemAdmin: false,
  organizationId: 1,
  role: OrgRole.ORG_ADMIN,
};

const otherOrgAdmin: JwtPayload = {
  sub: 11,
  email: 'other@example.com',
  isSystemAdmin: false,
  organizationId: 2,
  role: OrgRole.ORG_ADMIN,
};

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('create', () => {
    it('returns OrganizationResponseDto shape on success', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null);
      mockPrisma.organization.create.mockResolvedValue(baseOrg);

      const result = await service.create({ name: 'São Paulo FC' });

      expect(mockPrisma.organization.findFirst).toHaveBeenCalledWith({
        where: { slug: 'sao-paulo-fc', isDeleted: false },
        select: { id: true },
      });
      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'São Paulo FC', slug: 'sao-paulo-fc' },
        select: expect.objectContaining({ id: true, name: true, slug: true }),
      });
      expect(result).toEqual(baseOrg);
    });

    it('throws 409 when slug conflicts with existing organization', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue({ id: 2 });

      const err = await service
        .create({ name: 'São Paulo FC' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mockPrisma.organization.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated count and data', async () => {
      mockPrisma.organization.count.mockResolvedValue(2);
      mockPrisma.organization.findMany.mockResolvedValue([baseOrg]);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        q: 'São',
        status: EntityStatus.ACTIVE,
      });

      expect(mockPrisma.organization.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { isDeleted: false },
            { status: EntityStatus.ACTIVE },
            { name: { contains: 'São', mode: 'insensitive' } },
          ],
        },
      });
      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(result).toEqual({ count: 2, data: [baseOrg] });
    });
  });

  describe('findById', () => {
    it('returns DTO when organization exists', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(baseOrg);

      const result = await service.findById(1);

      expect(mockPrisma.organization.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false },
        select: expect.objectContaining({ id: true, name: true, slug: true }),
      });
      expect(result).toEqual(baseOrg);
    });

    it('throws 404 when organization does not exist', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null);

      const err = await service.findById(999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('update', () => {
    it('succeeds as system admin', async () => {
      mockPrisma.organization.findFirst
        .mockResolvedValueOnce({ id: 1, slug: 'sao-paulo-fc' })
        .mockResolvedValueOnce(null);
      mockPrisma.organization.update.mockResolvedValue({
        ...baseOrg,
        name: 'São Paulo FC Updated',
        slug: 'sao-paulo-fc-updated',
      });

      const result = await service.update(
        1,
        { name: 'São Paulo FC Updated' },
        systemAdmin,
      );

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'São Paulo FC Updated', slug: 'sao-paulo-fc-updated' },
        select: expect.objectContaining({ id: true }),
      });
      expect(result.name).toBe('São Paulo FC Updated');
    });

    it('succeeds as ORG_ADMIN of own organization', async () => {
      mockPrisma.organization.findFirst
        .mockResolvedValueOnce({ id: 1, slug: 'sao-paulo-fc' })
        .mockResolvedValueOnce(null);
      mockPrisma.organization.update.mockResolvedValue({
        ...baseOrg,
        name: 'São Paulo FC New',
        slug: 'sao-paulo-fc-new',
      });

      const result = await service.update(
        1,
        { name: 'São Paulo FC New' },
        orgAdmin,
      );

      expect(mockPrisma.organization.update).toHaveBeenCalled();
      expect(result.name).toBe('São Paulo FC New');
    });

    it('throws 403 when ORG_ADMIN tries to update a different organization', async () => {
      mockPrisma.organization.findFirst.mockResolvedValueOnce({
        id: 1,
        slug: 'sao-paulo-fc',
      });

      const err = await service
        .update(1, { name: 'São Paulo FC' }, otherOrgAdmin)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    });

    it('throws 404 when organization does not exist', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null);

      const err = await service
        .update(999, { name: 'Does not exist' }, systemAdmin)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('throws 409 when new slug conflicts with another existing organization', async () => {
      mockPrisma.organization.findFirst
        .mockResolvedValueOnce({ id: 1, slug: 'old-slug' })
        .mockResolvedValueOnce({ id: 5 });

      const err = await service
        .update(1, { name: 'Conflicting Name' }, systemAdmin)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('returns updated DTO on success', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.organization.update.mockResolvedValue({
        ...baseOrg,
        status: EntityStatus.INACTIVE,
      });

      const result = await service.updateStatus(1, {
        status: EntityStatus.INACTIVE,
      });

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: EntityStatus.INACTIVE },
        select: expect.objectContaining({ id: true, status: true }),
      });
      expect(result.status).toBe(EntityStatus.INACTIVE);
    });

    it('throws 404 when organization does not exist', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null);

      const err = await service
        .updateStatus(999, { status: EntityStatus.INACTIVE })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('softDelete', () => {
    it('calls $transaction and revokes refresh tokens on success', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.organization.update.mockResolvedValue({ id: 1 });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await service.softDelete(1);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true, status: EntityStatus.INACTIVE },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 1, isRevoked: false },
        data: { isRevoked: true },
      });
    });

    it('throws 404 when organization does not exist', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null);

      const err = await service.softDelete(999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
