import { Injectable } from '@nestjs/common';
import { MatchStatus, Prisma, TournamentTeamStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { slugify } from '../common/utils/slugify';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { ListTournamentsQueryDto } from './dto/list-tournaments-query.dto';
import { TournamentResponseDto } from './dto/tournament-response.dto';

const tournamentSelect = {
  id: true,
  name: true,
  slug: true,
  seasonId: true,
  categoryId: true,
  regulation: true,
  format: true,
  status: true,
  startsAt: true,
  endsAt: true,
  registrationStartsAt: true,
  registrationEndsAt: true,
  championTournamentTeamId: true,
  mvpTournamentRosterId: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      teams: {
        where: { status: TournamentTeamStatus.ACTIVE, isDeleted: false },
      },
    },
  },
} satisfies Prisma.TournamentSelect;

type TournamentRow = Prisma.TournamentGetPayload<{
  select: typeof tournamentSelect;
}>;

interface MatchCounts {
  total: number;
  finished: number;
}

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: number,
    userId: number,
    dto: CreateTournamentDto,
  ): Promise<TournamentResponseDto> {
    const season = await this.assertSeason(organizationId, dto.seasonId);

    if (dto.categoryId !== undefined) {
      await this.assertCategory(organizationId, dto.categoryId);
    }

    this.assertDateRanges(
      dto.startsAt ?? null,
      dto.endsAt ?? null,
      dto.registrationStartsAt ?? null,
      dto.registrationEndsAt ?? null,
    );

    const slug = await this.resolveSlug(
      organizationId,
      dto.slug,
      dto.name,
      season.label,
    );

    const row = await this.prisma.tournament.create({
      data: {
        organizationId,
        name: dto.name,
        slug,
        seasonId: dto.seasonId,
        categoryId: dto.categoryId ?? null,
        regulation: dto.regulation ?? null,
        format: dto.format,
        ...(dto.status === undefined ? {} : { status: dto.status }),
        startsAt: dto.startsAt ?? null,
        endsAt: dto.endsAt ?? null,
        registrationStartsAt: dto.registrationStartsAt ?? null,
        registrationEndsAt: dto.registrationEndsAt ?? null,
        createdByUserId: userId,
      },
      select: tournamentSelect,
    });

    return this.toResponse(row, { total: 0, finished: 0 });
  }

  async findAll(
    organizationId: number,
    query: ListTournamentsQueryDto,
  ): Promise<{ count: number; data: TournamentResponseDto[] }> {
    const filters: Prisma.TournamentWhereInput[] = [
      { organizationId, isDeleted: false },
    ];

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.ids?.length) {
      filters.push({ id: { in: query.ids } });
    }

    if (query.seasonId !== undefined) {
      filters.push({ seasonId: query.seasonId });
    }

    if (query.categoryId !== undefined) {
      filters.push({ categoryId: query.categoryId });
    }

    if (query.q) {
      filters.push({ name: { contains: query.q, mode: 'insensitive' } });
    }

    const where: Prisma.TournamentWhereInput = { AND: filters };
    const skip = (query.page - 1) * query.limit;

    const [count, rows] = await Promise.all([
      this.prisma.tournament.count({ where }),
      this.prisma.tournament.findMany({
        where,
        skip,
        take: query.limit,
        // A freshly created draft has no dates yet; nulls first keeps it at the top
        // of the admin's list instead of below every past edition.
        orderBy: [
          { startsAt: { sort: 'desc', nulls: 'first' } },
          { id: 'desc' },
        ],
        select: tournamentSelect,
      }),
    ]);

    const matchCounts = await this.loadMatchCounts(rows.map((row) => row.id));
    return {
      count,
      data: rows.map((row) =>
        this.toResponse(
          row,
          matchCounts.get(row.id) ?? { total: 0, finished: 0 },
        ),
      ),
    };
  }

  async findOne(
    organizationId: number,
    id: number,
  ): Promise<TournamentResponseDto> {
    const row = await this.findRowOrThrow(organizationId, id);
    const matchCounts = await this.loadMatchCounts([row.id]);
    return this.toResponse(
      row,
      matchCounts.get(row.id) ?? { total: 0, finished: 0 },
    );
  }

  private async findRowOrThrow(
    organizationId: number,
    id: number,
  ): Promise<TournamentRow> {
    const row = await this.prisma.tournament.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: tournamentSelect,
    });

    if (!row) {
      throw ApiException.notFound('Tournament not found');
    }

    return row;
  }

  // One grouped query per page, not one pair of counts per row. Prisma allows a
  // single filter per relation in _count, and these two need different ones.
  private async loadMatchCounts(
    tournamentIds: number[],
  ): Promise<Map<number, MatchCounts>> {
    if (tournamentIds.length === 0) return new Map();

    const groups = await this.prisma.match.groupBy({
      by: ['tournamentId', 'status'],
      where: { tournamentId: { in: tournamentIds }, isDeleted: false },
      _count: { _all: true },
    });

    const counts = new Map<number, MatchCounts>(
      tournamentIds.map((id) => [id, { total: 0, finished: 0 }]),
    );

    for (const group of groups) {
      const entry = counts.get(group.tournamentId);
      if (!entry) continue;
      // A cancelled match will never be played; counting it would freeze the
      // progress at 4/5 for a tournament that is in fact over (domain rules §5.6).
      if (group.status !== MatchStatus.CANCELLED)
        entry.total += group._count._all;
      if (group.status === MatchStatus.FINISHED)
        entry.finished += group._count._all;
    }

    return counts;
  }

  private async assertSeason(
    organizationId: number,
    seasonId: number,
  ): Promise<{ id: number; label: string }> {
    const season = await this.prisma.season.findFirst({
      where: { id: seasonId, organizationId, isDeleted: false },
      select: { id: true, label: true },
    });

    if (!season) {
      throw ApiException.unprocessable(
        'Season not found in this organization.',
        'INVALID_REFERENCE',
      );
    }

    return season;
  }

  private async assertCategory(
    organizationId: number,
    categoryId: number,
  ): Promise<void> {
    const category = await this.prisma.tournamentCategory.findFirst({
      where: { id: categoryId, organizationId, isDeleted: false },
      select: { id: true },
    });

    if (!category) {
      throw ApiException.unprocessable(
        'Category not found in this organization.',
        'INVALID_REFERENCE',
      );
    }
  }

  private assertDateRanges(
    startsAt: string | null,
    endsAt: string | null,
    registrationStartsAt: string | null,
    registrationEndsAt: string | null,
  ): void {
    if (
      startsAt !== null &&
      endsAt !== null &&
      new Date(startsAt).getTime() > new Date(endsAt).getTime()
    ) {
      throw ApiException.unprocessable(
        'startsAt must be on or before endsAt.',
        'INVALID_DATE_RANGE',
      );
    }

    if (
      registrationStartsAt !== null &&
      registrationEndsAt !== null &&
      new Date(registrationStartsAt).getTime() >
        new Date(registrationEndsAt).getTime()
    ) {
      throw ApiException.unprocessable(
        'registrationStartsAt must be on or before registrationEndsAt.',
        'INVALID_DATE_RANGE',
      );
    }
  }

  // The season label is free text ('2025/26'); slugify() strips '/' entirely, which
  // would collapse the label to '202526'. Uniqueness is per organization, not per
  // season, so the season has to be part of the slug or a tournament repeated next
  // season collides with itself.
  private deriveSlug(name: string, seasonLabel: string): string {
    return slugify(`${name} ${seasonLabel.replace(/\//g, '-')}`);
  }

  private async isSlugTaken(
    organizationId: number,
    slug: string,
  ): Promise<boolean> {
    const existing = await this.prisma.tournament.findFirst({
      where: { organizationId, slug, isDeleted: false },
      select: { id: true },
    });

    return existing !== null;
  }

  private async resolveSlug(
    organizationId: number,
    explicitSlug: string | undefined,
    name: string,
    seasonLabel: string,
  ): Promise<string> {
    if (explicitSlug !== undefined) {
      const slug = slugify(explicitSlug);
      if (await this.isSlugTaken(organizationId, slug)) {
        throw ApiException.conflict(
          'A tournament with this slug already exists.',
          'DUPLICATE_RECORD',
        );
      }
      return slug;
    }

    // The admin did not choose the derived slug, so a collision they did not cause
    // must not surface as a 409.
    const base = this.deriveSlug(name, seasonLabel);
    let candidate = base;
    let suffix = 1;
    while (await this.isSlugTaken(organizationId, candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  // Both bounds null means no registration window was ever configured — closed,
  // not "open forever", or every fresh DRAFT would advertise open registration.
  private isRegistrationOpen(
    startsAt: Date | null,
    endsAt: Date | null,
  ): boolean {
    if (startsAt === null && endsAt === null) return false;
    const now = Date.now();
    if (startsAt !== null && now < startsAt.getTime()) return false;
    if (endsAt !== null && now > endsAt.getTime()) return false;
    return true;
  }

  private toResponse(
    row: TournamentRow,
    matchCounts: MatchCounts,
  ): TournamentResponseDto {
    const { _count, ...rest } = row;
    return {
      ...rest,
      isRegistrationOpen: this.isRegistrationOpen(
        row.registrationStartsAt,
        row.registrationEndsAt,
      ),
      enrolledTeamCount: _count.teams,
      matchCount: matchCounts.total,
      finishedMatchCount: matchCounts.finished,
    };
  }
}
