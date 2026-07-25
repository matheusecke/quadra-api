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
});
