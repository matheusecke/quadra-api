import { Injectable } from '@nestjs/common';
import { AffiliationStatus, EntityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpdateTeamStatusDto } from './dto/update-team-status.dto';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto';
import { TeamResponseDto } from './dto/team-response.dto';

const teamSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeamSelect;

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTeamDto): Promise<TeamResponseDto> {
    const slug = slugify(dto.name);

    const existing = await this.prisma.team.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });

    if (existing) {
      throw ApiException.conflict(
        'A team with this name already exists.',
        'DUPLICATE_RECORD',
      );
    }

    return this.prisma.team.create({
      data: { name: dto.name, slug },
      select: teamSelect,
    });
  }

  async findAll(
    query: ListTeamsQueryDto,
  ): Promise<{ count: number; data: TeamResponseDto[] }> {
    const filters: Prisma.TeamWhereInput[] = [{ isDeleted: false }];

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.q) {
      filters.push({ name: { contains: query.q, mode: 'insensitive' } });
    }

    if (query.organizationId) {
      filters.push({
        organizationTeamAffiliations: {
          some: {
            organizationId: query.organizationId,
            isDeleted: false,
            status: AffiliationStatus.ACTIVE,
          },
        },
      });
    }

    const where: Prisma.TeamWhereInput = { AND: filters };
    const skip = (query.page - 1) * query.limit;

    const [count, data] = await Promise.all([
      this.prisma.team.count({ where }),
      this.prisma.team.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: teamSelect,
      }),
    ]);

    return { count, data };
  }

  async findById(id: number): Promise<TeamResponseDto> {
    const team = await this.prisma.team.findFirst({
      where: { id, isDeleted: false },
      select: teamSelect,
    });

    if (!team) {
      throw ApiException.notFound('Team not found');
    }

    return team;
  }

  async update(id: number, dto: UpdateTeamDto): Promise<TeamResponseDto> {
    const existing = await this.prisma.team.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, slug: true },
    });

    if (!existing) {
      throw ApiException.notFound('Team not found');
    }

    const newSlug = slugify(dto.name);

    if (newSlug !== existing.slug) {
      const conflict = await this.prisma.team.findFirst({
        where: { slug: newSlug, isDeleted: false, id: { not: id } },
        select: { id: true },
      });

      if (conflict) {
        throw ApiException.conflict(
          'A team with this name already exists.',
          'DUPLICATE_RECORD',
        );
      }
    }

    return this.prisma.team.update({
      where: { id },
      data: { name: dto.name, slug: newSlug },
      select: teamSelect,
    });
  }

  async updateStatus(
    id: number,
    dto: UpdateTeamStatusDto,
  ): Promise<TeamResponseDto> {
    const existing = await this.prisma.team.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw ApiException.notFound('Team not found');
    }

    return this.prisma.team.update({
      where: { id },
      data: { status: dto.status },
      select: teamSelect,
    });
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.prisma.team.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw ApiException.notFound('Team not found');
    }

    await this.prisma.team.update({
      where: { id },
      data: { isDeleted: true, status: EntityStatus.INACTIVE },
    });
  }
}
