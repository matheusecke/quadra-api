import { Test, TestingModule } from '@nestjs/testing';
import { EntityStatus } from '@prisma/client';
import { TournamentCategoriesService } from './tournament-categories.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  tournamentCategory: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const ORG_ID = 7;

const baseCategory = {
  id: 6,
  name: 'Sub-17',
  slug: 'sub-17',
  sortOrder: 3,
  status: EntityStatus.ACTIVE,
  createdAt: new Date('2026-07-25T18:40:00.000Z'),
  updatedAt: new Date('2026-07-25T18:40:00.000Z'),
};

describe('TournamentCategoriesService', () => {
  let service: TournamentCategoriesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentCategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TournamentCategoriesService>(
      TournamentCategoriesService,
    );
  });

  describe('create', () => {
    it('derives the slug from the name', async () => {
      mockPrisma.tournamentCategory.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentCategory.create.mockResolvedValue(baseCategory);

      await service.create(ORG_ID, { name: 'Sub-17', sortOrder: 3 });

      expect(mockPrisma.tournamentCategory.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG_ID,
          name: 'Sub-17',
          slug: 'sub-17',
          sortOrder: 3,
        },
        select: expect.any(Object),
      });
    });

    it('persists a null sortOrder when it is omitted', async () => {
      mockPrisma.tournamentCategory.findFirst.mockResolvedValue(null);
      mockPrisma.tournamentCategory.create.mockResolvedValue({
        ...baseCategory,
        sortOrder: null,
      });

      await service.create(ORG_ID, { name: 'Sub-17' });

      expect(mockPrisma.tournamentCategory.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG_ID,
          name: 'Sub-17',
          slug: 'sub-17',
          sortOrder: null,
        },
        select: expect.any(Object),
      });
    });

    it('rejects a name already used in the same organization', async () => {
      mockPrisma.tournamentCategory.findFirst.mockResolvedValueOnce({ id: 9 });

      await expect(
        service.create(ORG_ID, { name: 'Sub-17' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rejects a distinct name that collides on the derived slug', async () => {
      mockPrisma.tournamentCategory.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 9 });

      await expect(
        service.create(ORG_ID, { name: 'Sub 17' }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('findAll', () => {
    it('returns the { count, data } shape', async () => {
      mockPrisma.tournamentCategory.count.mockResolvedValue(1);
      mockPrisma.tournamentCategory.findMany.mockResolvedValue([baseCategory]);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(result).toEqual({ count: 1, data: [baseCategory] });
    });

    it('orders by sortOrder ascending with nulls last, then name, then id', async () => {
      mockPrisma.tournamentCategory.count.mockResolvedValue(0);
      mockPrisma.tournamentCategory.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(mockPrisma.tournamentCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { sortOrder: { sort: 'asc', nulls: 'last' } },
            { name: 'asc' },
            { id: 'asc' },
          ],
        }),
      );
    });

    it('combines q, ids and status as AND filters scoped to the organization', async () => {
      mockPrisma.tournamentCategory.count.mockResolvedValue(0);
      mockPrisma.tournamentCategory.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, {
        page: 1,
        limit: 10,
        q: 'Sub',
        ids: [1, 2],
        status: EntityStatus.ACTIVE,
      });

      expect(mockPrisma.tournamentCategory.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { organizationId: ORG_ID, isDeleted: false },
            { status: EntityStatus.ACTIVE },
            { id: { in: [1, 2] } },
            { name: { contains: 'Sub', mode: 'insensitive' } },
          ],
        },
      });
    });
  });

  describe('update', () => {
    it('recomputes the slug when the name changes', async () => {
      mockPrisma.tournamentCategory.findFirst
        .mockResolvedValueOnce(baseCategory)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.tournamentCategory.update.mockResolvedValue(baseCategory);

      await service.update(ORG_ID, 6, { name: 'Sub-17 Masculino' });

      expect(mockPrisma.tournamentCategory.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { name: 'Sub-17 Masculino', slug: 'sub-17-masculino' },
        select: expect.any(Object),
      });
    });

    it('leaves name and slug untouched when only sortOrder is sent', async () => {
      mockPrisma.tournamentCategory.findFirst.mockResolvedValue(baseCategory);
      mockPrisma.tournamentCategory.update.mockResolvedValue(baseCategory);

      await service.update(ORG_ID, 6, { sortOrder: 4 });

      expect(mockPrisma.tournamentCategory.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { sortOrder: 4 },
        select: expect.any(Object),
      });
    });

    it('clears the manual ordering on an explicit null sortOrder', async () => {
      mockPrisma.tournamentCategory.findFirst.mockResolvedValue(baseCategory);
      mockPrisma.tournamentCategory.update.mockResolvedValue({
        ...baseCategory,
        sortOrder: null,
      });

      await service.update(ORG_ID, 6, { sortOrder: null });

      expect(mockPrisma.tournamentCategory.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { sortOrder: null },
        select: expect.any(Object),
      });
    });

    it('rejects a name already used by another category', async () => {
      mockPrisma.tournamentCategory.findFirst
        .mockResolvedValueOnce(baseCategory)
        .mockResolvedValueOnce({ id: 9 });

      await expect(
        service.update(ORG_ID, 6, { name: 'Adulto Masculino' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('raises 404 for an id outside the caller organization', async () => {
      mockPrisma.tournamentCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 6, { name: 'Anything' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('updateStatus', () => {
    it('writes the new status and returns the read model', async () => {
      mockPrisma.tournamentCategory.findFirst.mockResolvedValue({ id: 6 });
      mockPrisma.tournamentCategory.update.mockResolvedValue({
        ...baseCategory,
        status: EntityStatus.INACTIVE,
      });

      const result = await service.updateStatus(ORG_ID, 6, {
        status: EntityStatus.INACTIVE,
      });

      expect(result.status).toBe(EntityStatus.INACTIVE);
    });

    it('raises 404 for an id outside the caller organization', async () => {
      mockPrisma.tournamentCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(ORG_ID, 6, { status: EntityStatus.INACTIVE }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
