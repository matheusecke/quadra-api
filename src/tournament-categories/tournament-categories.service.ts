import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { slugify } from '../common/utils/slugify';
import { CreateTournamentCategoryDto } from './dto/create-tournament-category.dto';
import { UpdateTournamentCategoryDto } from './dto/update-tournament-category.dto';
import { UpdateTournamentCategoryStatusDto } from './dto/update-tournament-category-status.dto';
import { ListTournamentCategoriesQueryDto } from './dto/list-tournament-categories-query.dto';
import { TournamentCategoryResponseDto } from './dto/tournament-category-response.dto';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  sortOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentCategorySelect;

@Injectable()
export class TournamentCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: number,
    dto: CreateTournamentCategoryDto,
  ): Promise<TournamentCategoryResponseDto> {
    const slug = slugify(dto.name);
    await this.assertNameAndSlugAvailable(organizationId, dto.name, slug);

    return this.prisma.tournamentCategory.create({
      data: {
        organizationId,
        name: dto.name,
        slug,
        sortOrder: dto.sortOrder ?? null,
      },
      select: categorySelect,
    });
  }

  async findAll(
    organizationId: number,
    query: ListTournamentCategoriesQueryDto,
  ): Promise<{ count: number; data: TournamentCategoryResponseDto[] }> {
    const filters: Prisma.TournamentCategoryWhereInput[] = [
      { organizationId, isDeleted: false },
    ];

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.ids?.length) {
      filters.push({ id: { in: query.ids } });
    }

    if (query.q) {
      filters.push({ name: { contains: query.q, mode: 'insensitive' } });
    }

    const where: Prisma.TournamentCategoryWhereInput = { AND: filters };
    const skip = (query.page - 1) * query.limit;

    const [count, data] = await Promise.all([
      this.prisma.tournamentCategory.count({ where }),
      this.prisma.tournamentCategory.findMany({
        where,
        skip,
        take: query.limit,
        // Manually ordered categories first, then the unordered ones alphabetically.
        orderBy: [
          { sortOrder: { sort: 'asc', nulls: 'last' } },
          { name: 'asc' },
          { id: 'asc' },
        ],
        select: categorySelect,
      }),
    ]);

    return { count, data };
  }

  async update(
    organizationId: number,
    id: number,
    dto: UpdateTournamentCategoryDto,
  ): Promise<TournamentCategoryResponseDto> {
    const existing = await this.prisma.tournamentCategory.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { id: true, name: true },
    });

    if (!existing) {
      throw ApiException.notFound('Tournament category not found');
    }

    const isRenamed = dto.name !== undefined && dto.name !== existing.name;
    const slug = isRenamed ? slugify(dto.name as string) : undefined;

    if (isRenamed) {
      await this.assertNameAndSlugAvailable(
        organizationId,
        dto.name as string,
        slug as string,
        id,
      );
    }

    return this.prisma.tournamentCategory.update({
      where: { id },
      data: {
        ...(isRenamed ? { name: dto.name, slug } : {}),
        ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
      },
      select: categorySelect,
    });
  }

  async updateStatus(
    organizationId: number,
    id: number,
    dto: UpdateTournamentCategoryStatusDto,
  ): Promise<TournamentCategoryResponseDto> {
    const existing = await this.prisma.tournamentCategory.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw ApiException.notFound('Tournament category not found');
    }

    return this.prisma.tournamentCategory.update({
      where: { id },
      data: { status: dto.status },
      select: categorySelect,
    });
  }

  // Two separate conflicts: 'Sub 17' and 'Sub-17' are distinct names that
  // both slugify to 'sub-17', so a free name can still hit the slug index.
  private async assertNameAndSlugAvailable(
    organizationId: number,
    name: string,
    slug: string,
    excludeId?: number,
  ): Promise<void> {
    const scope = {
      organizationId,
      isDeleted: false,
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    };

    const nameConflict = await this.prisma.tournamentCategory.findFirst({
      where: { ...scope, name },
      select: { id: true },
    });

    if (nameConflict) {
      throw ApiException.conflict(
        'A category with this name already exists.',
        'DUPLICATE_RECORD',
      );
    }

    const slugConflict = await this.prisma.tournamentCategory.findFirst({
      where: { ...scope, slug },
      select: { id: true },
    });

    if (slugConflict) {
      throw ApiException.conflict(
        'A category with this slug already exists.',
        'DUPLICATE_RECORD',
      );
    }
  }
}
