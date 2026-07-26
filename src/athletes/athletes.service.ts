import { Injectable } from '@nestjs/common';
import { AffiliationStatus, EntityStatus, OrgRole, Prisma, RosterRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAthletesQueryDto } from './dto/list-athletes-query.dto';
import { AthleteCatalogResponseDto } from './dto/athlete-catalog-response.dto';

const athleteSelect = {
  teamId: true,
  role: true,
  jerseyNumber: true,
  position: true,
  user: {
    select: { id: true, name: true, status: true },
  },
} satisfies Prisma.OrganizationUserAffiliationSelect;

@Injectable()
export class AthletesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: number,
    query: ListAthletesQueryDto,
  ): Promise<{ count: number; data: AthleteCatalogResponseDto[] }> {
    const user: Prisma.UserWhereInput = {
      isDeleted: false,
      status: EntityStatus.ACTIVE,
      ...(query.ids ? { id: { in: query.ids } } : {}),
      ...(query.q
        ? { name: { contains: query.q, mode: 'insensitive' } }
        : {}),
    };
    const where: Prisma.OrganizationUserAffiliationWhereInput = {
      organizationId,
      isDeleted: false,
      status: AffiliationStatus.ACTIVE,
      role: query.role ?? { in: [OrgRole.ATHLETE, OrgRole.COACHING_STAFF] },
      ...(query.teamId ? { teamId: query.teamId } : {}),
      user,
    };

    const [count, rows] = await Promise.all([
      this.prisma.organizationUserAffiliation.count({ where }),
      this.prisma.organizationUserAffiliation.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ user: { name: 'asc' } }, { userId: 'asc' }],
        select: athleteSelect,
      }),
    ]);

    return {
      count,
      data: rows.map((row) => ({
        id: row.user.id,
        name: row.user.name,
        teamId: row.teamId as number,
        role: row.role as RosterRole,
        jerseyNumber: row.jerseyNumber,
        position: row.position,
        status: row.user.status,
      })),
    };
  }
}
