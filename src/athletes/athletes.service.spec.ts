import { Test, TestingModule } from '@nestjs/testing';
import {
  AffiliationStatus,
  BasketballPosition,
  EntityStatus,
  OrgRole,
} from '@prisma/client';
import { AthletesService } from './athletes.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  organizationUserAffiliation: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

const affiliationRow = {
  teamId: 8,
  role: OrgRole.ATHLETE,
  jerseyNumber: 7,
  position: BasketballPosition.PG,
  user: {
    id: 165,
    name: 'Rafael Moura',
    status: EntityStatus.ACTIVE,
  },
};

describe('AthletesService', () => {
  let service: AthletesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AthletesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AthletesService>(AthletesService);
  });

  describe('findAll', () => {
    it('lists both eligible roles with active tenant and user filters by default', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(1);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([
        affiliationRow,
      ]);

      const result = await service.findAll(42, { page: 1, limit: 10 });

      const where = {
        organizationId: 42,
        isDeleted: false,
        status: AffiliationStatus.ACTIVE,
        role: { in: [OrgRole.ATHLETE, OrgRole.COACHING_STAFF] },
        user: { isDeleted: false, status: EntityStatus.ACTIVE },
      };
      expect(mockPrisma.organizationUserAffiliation.count).toHaveBeenCalledWith(
        { where },
      );
      expect(result.data).toEqual([
        {
          id: 165,
          name: 'Rafael Moura',
          teamId: 8,
          role: OrgRole.ATHLETE,
          jerseyNumber: 7,
          position: BasketballPosition.PG,
          status: EntityStatus.ACTIVE,
        },
      ]);
    });

    it('combines q, ids, teamId and role and orders by user identity', async () => {
      mockPrisma.organizationUserAffiliation.count.mockResolvedValue(0);
      mockPrisma.organizationUserAffiliation.findMany.mockResolvedValue([]);

      await service.findAll(42, {
        page: 2,
        limit: 5,
        q: 'rafael',
        ids: [165, 166],
        teamId: 8,
        role: OrgRole.ATHLETE,
      });

      expect(
        mockPrisma.organizationUserAffiliation.findMany,
      ).toHaveBeenCalledWith({
        where: {
          organizationId: 42,
          isDeleted: false,
          status: AffiliationStatus.ACTIVE,
          role: OrgRole.ATHLETE,
          teamId: 8,
          user: {
            isDeleted: false,
            status: EntityStatus.ACTIVE,
            id: { in: [165, 166] },
            name: { contains: 'rafael', mode: 'insensitive' },
          },
        },
        skip: 5,
        take: 5,
        orderBy: [{ user: { name: 'asc' } }, { userId: 'asc' }],
        select: expect.any(Object),
      });
    });
  });
});
