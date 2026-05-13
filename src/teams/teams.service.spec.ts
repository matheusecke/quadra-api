import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AffiliationStatus, EntityStatus } from '@prisma/client';
import { TeamsService } from './teams.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';

const mockPrisma: any = {
  team: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const baseTeam = {
  id: 1,
  name: 'São Paulo FC',
  slug: 'sao-paulo-fc',
  status: EntityStatus.ACTIVE,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('TeamsService', () => {
  let service: TeamsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  describe('create', () => {
    it('returns TeamResponseDto shape on success', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);
      mockPrisma.team.create.mockResolvedValue(baseTeam);

      const result = await service.create({ name: 'São Paulo FC' });

      expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
        where: { slug: 'sao-paulo-fc', isDeleted: false },
        select: { id: true },
      });
      expect(mockPrisma.team.create).toHaveBeenCalledWith({
        data: { name: 'São Paulo FC', slug: 'sao-paulo-fc' },
        select: expect.objectContaining({ id: true, name: true, slug: true }),
      });
      expect(result).toEqual(baseTeam);
    });

    it('throws 409 when slug conflicts with existing team', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({ id: 2 });

      const err = await service
        .create({ name: 'São Paulo FC' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mockPrisma.team.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated count and data', async () => {
      mockPrisma.team.count.mockResolvedValue(2);
      mockPrisma.team.findMany.mockResolvedValue([baseTeam]);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        q: 'São',
        status: EntityStatus.ACTIVE,
      });

      expect(mockPrisma.team.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { isDeleted: false },
            { status: EntityStatus.ACTIVE },
            { name: { contains: 'São', mode: 'insensitive' } },
          ],
        },
      });
      expect(mockPrisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(result).toEqual({ count: 2, data: [baseTeam] });
    });

    it('includes organizationAffiliations filter when organizationId is provided', async () => {
      mockPrisma.team.count.mockResolvedValue(1);
      mockPrisma.team.findMany.mockResolvedValue([baseTeam]);

      await service.findAll({ page: 1, limit: 10, organizationId: 42 });

      expect(mockPrisma.team.count).toHaveBeenCalledWith({
        where: {
          AND: expect.arrayContaining([
            {
              organizationAffiliations: {
                some: {
                  organizationId: 42,
                  isDeleted: false,
                  status: AffiliationStatus.ACTIVE,
                },
              },
            },
          ]),
        },
      });
    });

    it('does not include organizationAffiliations filter when organizationId is absent', async () => {
      mockPrisma.team.count.mockResolvedValue(2);
      mockPrisma.team.findMany.mockResolvedValue([baseTeam]);

      await service.findAll({ page: 1, limit: 10 });

      const andFilters: object[] =
        mockPrisma.team.count.mock.calls[0][0].where.AND;
      expect(andFilters.some((f) => 'organizationAffiliations' in f)).toBe(
        false,
      );
    });
  });

  describe('findById', () => {
    it('returns DTO when team exists', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(baseTeam);

      const result = await service.findById(1);

      expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false },
        select: expect.objectContaining({ id: true, name: true, slug: true }),
      });
      expect(result).toEqual(baseTeam);
    });

    it('throws 404 when team does not exist', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service.findById(999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('update', () => {
    it('returns updated DTO on success', async () => {
      mockPrisma.team.findFirst
        .mockResolvedValueOnce({ id: 1, slug: 'sao-paulo-fc' })
        .mockResolvedValueOnce(null);
      mockPrisma.team.update.mockResolvedValue({
        ...baseTeam,
        name: 'São Paulo FC Updated',
        slug: 'sao-paulo-fc-updated',
      });

      const result = await service.update(1, { name: 'São Paulo FC Updated' });

      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'São Paulo FC Updated', slug: 'sao-paulo-fc-updated' },
        select: expect.objectContaining({ id: true }),
      });
      expect(result.name).toBe('São Paulo FC Updated');
    });

    it('throws 404 when team does not exist', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service
        .update(999, { name: 'Does not exist' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('throws 409 when new slug conflicts with another existing team', async () => {
      mockPrisma.team.findFirst
        .mockResolvedValueOnce({ id: 1, slug: 'old-slug' })
        .mockResolvedValueOnce({ id: 5 });

      const err = await service
        .update(1, { name: 'Conflicting Name' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(mockPrisma.team.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('returns updated DTO on success', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.team.update.mockResolvedValue({
        ...baseTeam,
        status: EntityStatus.INACTIVE,
      });

      const result = await service.updateStatus(1, {
        status: EntityStatus.INACTIVE,
      });

      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: EntityStatus.INACTIVE },
        select: expect.objectContaining({ id: true, status: true }),
      });
      expect(result.status).toBe(EntityStatus.INACTIVE);
    });

    it('throws 404 when team does not exist', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service
        .updateStatus(999, { status: EntityStatus.INACTIVE })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('softDelete', () => {
    it('calls team.update with isDeleted:true and status:INACTIVE on success', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.team.update.mockResolvedValue({ id: 1 });

      await service.softDelete(1);

      expect(mockPrisma.team.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isDeleted: true, status: EntityStatus.INACTIVE },
      });
    });

    it('throws 404 when team does not exist', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const err = await service.softDelete(999).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(mockPrisma.team.update).not.toHaveBeenCalled();
    });
  });
});
