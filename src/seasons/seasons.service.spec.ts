import { Test, TestingModule } from '@nestjs/testing';
import { SeasonStatus } from '@prisma/client';
import { SeasonsService } from './seasons.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  season: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const ORG_ID = 7;

const baseSeasonRow = {
  id: 3,
  label: '2025/26',
  startDate: new Date('2025-08-01T00:00:00.000Z'),
  endDate: new Date('2026-07-31T00:00:00.000Z'),
  status: SeasonStatus.ACTIVE,
  createdAt: new Date('2026-07-20T14:03:11.482Z'),
  updatedAt: new Date('2026-07-24T09:12:00.145Z'),
};

describe('SeasonsService', () => {
  let service: SeasonsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SeasonsService>(SeasonsService);
  });

  describe('create', () => {
    it('returns dates as YYYY-MM-DD strings', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(null);
      mockPrisma.season.create.mockResolvedValue(baseSeasonRow);

      const result = await service.create(ORG_ID, {
        label: '2025/26',
        startDate: '2025-08-01',
        endDate: '2026-07-31',
      });

      expect(result).toEqual({
        id: 3,
        label: '2025/26',
        startDate: '2025-08-01',
        endDate: '2026-07-31',
        status: SeasonStatus.ACTIVE,
        createdAt: baseSeasonRow.createdAt,
        updatedAt: baseSeasonRow.updatedAt,
      });
    });

    it('persists the caller organization and UTC-midnight dates', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(null);
      mockPrisma.season.create.mockResolvedValue(baseSeasonRow);

      await service.create(ORG_ID, {
        label: '2025/26',
        startDate: '2025-08-01',
        endDate: '2026-07-31',
      });

      expect(mockPrisma.season.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG_ID,
          label: '2025/26',
          startDate: new Date('2025-08-01T00:00:00.000Z'),
          endDate: new Date('2026-07-31T00:00:00.000Z'),
        },
        select: expect.any(Object),
      });
    });

    it('checks label uniqueness within the caller organization only', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(null);
      mockPrisma.season.create.mockResolvedValue(baseSeasonRow);

      await service.create(ORG_ID, {
        label: '2025/26',
        startDate: '2025-08-01',
        endDate: '2026-07-31',
      });

      expect(mockPrisma.season.findFirst).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, label: '2025/26', isDeleted: false },
        select: { id: true },
      });
    });

    it('rejects a label already used in the same organization', async () => {
      mockPrisma.season.findFirst.mockResolvedValue({ id: 9 });

      await expect(
        service.create(ORG_ID, {
          label: '2025/26',
          startDate: '2025-08-01',
          endDate: '2026-07-31',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rejects a start date after the end date', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, {
          label: '2025/26',
          startDate: '2026-08-01',
          endDate: '2025-07-31',
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rejects a calendar-invalid date that matches the format', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, {
          label: '2025/26',
          startDate: '2026-02-30',
          endDate: '2026-07-31',
        }),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('findAll', () => {
    it('returns the { count, data } shape with formatted dates', async () => {
      mockPrisma.season.count.mockResolvedValue(1);
      mockPrisma.season.findMany.mockResolvedValue([baseSeasonRow]);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(result).toEqual({
        count: 1,
        data: [
          {
            id: 3,
            label: '2025/26',
            startDate: '2025-08-01',
            endDate: '2026-07-31',
            status: SeasonStatus.ACTIVE,
            createdAt: baseSeasonRow.createdAt,
            updatedAt: baseSeasonRow.updatedAt,
          },
        ],
      });
    });

    it('scopes every query to the caller organization', async () => {
      mockPrisma.season.count.mockResolvedValue(0);
      mockPrisma.season.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { page: 1, limit: 10 });

      expect(mockPrisma.season.count).toHaveBeenCalledWith({
        where: { AND: [{ organizationId: ORG_ID, isDeleted: false }] },
      });
    });

    it('combines q, ids and status as AND filters', async () => {
      mockPrisma.season.count.mockResolvedValue(0);
      mockPrisma.season.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, {
        page: 1,
        limit: 10,
        q: '2025',
        ids: [3, 7],
        status: SeasonStatus.ACTIVE,
      });

      expect(mockPrisma.season.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { organizationId: ORG_ID, isDeleted: false },
            { status: SeasonStatus.ACTIVE },
            { id: { in: [3, 7] } },
            { label: { contains: '2025', mode: 'insensitive' } },
          ],
        },
      });
    });

    it('orders by start date descending then id descending', async () => {
      mockPrisma.season.count.mockResolvedValue(0);
      mockPrisma.season.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { page: 2, limit: 5 });

      expect(mockPrisma.season.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        }),
      );
    });
  });

  describe('update', () => {
    it('validates the range against the stored end date on a partial payload', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(baseSeasonRow);

      await expect(
        service.update(ORG_ID, 3, { startDate: '2026-12-01' }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('keeps the stored label when only dates are sent', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(baseSeasonRow);
      mockPrisma.season.update.mockResolvedValue(baseSeasonRow);

      await service.update(ORG_ID, 3, { endDate: '2026-08-15' });

      expect(mockPrisma.season.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { endDate: new Date('2026-08-15T00:00:00.000Z') },
        select: expect.any(Object),
      });
    });

    it('rejects a label already used by another season', async () => {
      mockPrisma.season.findFirst
        .mockResolvedValueOnce(baseSeasonRow)
        .mockResolvedValueOnce({ id: 9 });

      await expect(
        service.update(ORG_ID, 3, { label: '2024/25' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('raises 404 for an id outside the caller organization', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 3, { label: 'Anything' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('updateStatus', () => {
    it('writes the new status and returns the full read model', async () => {
      mockPrisma.season.findFirst.mockResolvedValue({ id: 3 });
      mockPrisma.season.update.mockResolvedValue({
        ...baseSeasonRow,
        status: SeasonStatus.ARCHIVED,
      });

      const result = await service.updateStatus(ORG_ID, 3, {
        status: SeasonStatus.ARCHIVED,
      });

      expect(result.status).toBe(SeasonStatus.ARCHIVED);
    });

    it('looks the season up scoped to the caller organization', async () => {
      mockPrisma.season.findFirst.mockResolvedValue({ id: 3 });
      mockPrisma.season.update.mockResolvedValue(baseSeasonRow);

      await service.updateStatus(ORG_ID, 3, { status: SeasonStatus.ARCHIVED });

      expect(mockPrisma.season.findFirst).toHaveBeenCalledWith({
        where: { id: 3, organizationId: ORG_ID, isDeleted: false },
        select: { id: true },
      });
    });

    it('raises 404 for an id outside the caller organization', async () => {
      mockPrisma.season.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(ORG_ID, 3, { status: SeasonStatus.ARCHIVED }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
