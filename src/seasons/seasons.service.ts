import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';
import { UpdateSeasonStatusDto } from './dto/update-season-status.dto';
import { ListSeasonsQueryDto } from './dto/list-seasons-query.dto';
import { SeasonResponseDto } from './dto/season-response.dto';

const seasonSelect = {
  id: true,
  label: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SeasonSelect;

type SeasonRow = Prisma.SeasonGetPayload<{ select: typeof seasonSelect }>;

@Injectable()
export class SeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: number,
    dto: CreateSeasonDto,
  ): Promise<SeasonResponseDto> {
    const startDate = this.parseDateOnly(dto.startDate, 'startDate');
    const endDate = this.parseDateOnly(dto.endDate, 'endDate');
    this.assertDateRange(startDate, endDate);

    const existing = await this.prisma.season.findFirst({
      where: { organizationId, label: dto.label, isDeleted: false },
      select: { id: true },
    });

    if (existing) {
      throw ApiException.conflict(
        'A season with this label already exists.',
        'DUPLICATE_RECORD',
      );
    }

    const row = await this.prisma.season.create({
      data: { organizationId, label: dto.label, startDate, endDate },
      select: seasonSelect,
    });

    return this.toResponse(row);
  }

  async findAll(
    organizationId: number,
    query: ListSeasonsQueryDto,
  ): Promise<{ count: number; data: SeasonResponseDto[] }> {
    const filters: Prisma.SeasonWhereInput[] = [
      { organizationId, isDeleted: false },
    ];

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.ids?.length) {
      filters.push({ id: { in: query.ids } });
    }

    if (query.q) {
      filters.push({ label: { contains: query.q, mode: 'insensitive' } });
    }

    const where: Prisma.SeasonWhereInput = { AND: filters };
    const skip = (query.page - 1) * query.limit;

    const [count, rows] = await Promise.all([
      this.prisma.season.count({ where }),
      this.prisma.season.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        select: seasonSelect,
      }),
    ]);

    return { count, data: rows.map((row) => this.toResponse(row)) };
  }

  async update(
    organizationId: number,
    id: number,
    dto: UpdateSeasonDto,
  ): Promise<SeasonResponseDto> {
    const existing = await this.prisma.season.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: seasonSelect,
    });

    if (!existing) {
      throw ApiException.notFound('Season not found');
    }

    const startDate =
      dto.startDate === undefined
        ? existing.startDate
        : this.parseDateOnly(dto.startDate, 'startDate');
    const endDate =
      dto.endDate === undefined
        ? existing.endDate
        : this.parseDateOnly(dto.endDate, 'endDate');
    this.assertDateRange(startDate, endDate);

    if (dto.label !== undefined && dto.label !== existing.label) {
      const conflict = await this.prisma.season.findFirst({
        where: {
          organizationId,
          label: dto.label,
          isDeleted: false,
          id: { not: id },
        },
        select: { id: true },
      });

      if (conflict) {
        throw ApiException.conflict(
          'A season with this label already exists.',
          'DUPLICATE_RECORD',
        );
      }
    }

    const row = await this.prisma.season.update({
      where: { id },
      data: {
        ...(dto.label === undefined ? {} : { label: dto.label }),
        ...(dto.startDate === undefined ? {} : { startDate }),
        ...(dto.endDate === undefined ? {} : { endDate }),
      },
      select: seasonSelect,
    });

    return this.toResponse(row);
  }

  async updateStatus(
    organizationId: number,
    id: number,
    dto: UpdateSeasonStatusDto,
  ): Promise<SeasonResponseDto> {
    const existing = await this.prisma.season.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      throw ApiException.notFound('Season not found');
    }

    const row = await this.prisma.season.update({
      where: { id },
      data: { status: dto.status },
      select: seasonSelect,
    });

    return this.toResponse(row);
  }

  // `@db.Date` columns are calendar days, not instants: they travel as
  // 'YYYY-MM-DD' so no timezone can shift them to the previous day.
  private parseDateOnly(value: string, field: string): Date {
    const parsed = new Date(`${value}T00:00:00.000Z`);

    // The DTO regex accepts 2026-02-30; JavaScript silently rolls it to March 2.
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw ApiException.unprocessable(
        `${field} is not a valid calendar date.`,
        'INVALID_DATE',
      );
    }

    return parsed;
  }

  private assertDateRange(startDate: Date, endDate: Date): void {
    if (startDate.getTime() > endDate.getTime()) {
      throw ApiException.unprocessable(
        'startDate must be on or before endDate.',
        'INVALID_DATE_RANGE',
      );
    }
  }

  private toResponse(row: SeasonRow): SeasonResponseDto {
    return {
      ...row,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
    };
  }
}
