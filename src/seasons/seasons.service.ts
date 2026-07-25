import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateSeasonDto } from './dto/create-season.dto';
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
