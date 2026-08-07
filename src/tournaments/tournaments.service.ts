import { Injectable } from '@nestjs/common';
import {
  MatchStatus,
  Prisma,
  RosterRole,
  TournamentFormat,
  TournamentTeamStatus,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { slugify } from '../common/utils/slugify';
import { StatisticsService } from '../statistics/statistics.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { CompleteTournamentDto } from './dto/complete-tournament.dto';
import { ListTournamentsQueryDto } from './dto/list-tournaments-query.dto';
import { TournamentResponseDto } from './dto/tournament-response.dto';
import { ChampionSuggestionResponseDto } from './dto/champion-suggestion-response.dto';
import { TournamentLeadersResponseDto } from './dto/tournament-leaders-response.dto';

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

const leaderStatisticSelect = {
  tournamentRosterId: true,
  userId: true,
  minutesSeconds: true,
  pts: true,
  reb: true,
  ast: true,
  stl: true,
  blk: true,
  tov: true,
  pf: true,
  fgm: true,
  fga: true,
  threeFgm: true,
  threeFga: true,
  ftm: true,
  fta: true,
  tournamentRoster: {
    select: {
      tournamentTeamId: true,
      displayNameSnapshot: true,
      tournamentTeam: {
        select: { teamId: true, displayNameSnapshot: true },
      },
    },
  },
} satisfies Prisma.PlayerMatchStatisticSelect;

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statistics: StatisticsService,
  ) {}

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
      dto.startsAt === undefined ? null : new Date(dto.startsAt),
      dto.endsAt === undefined ? null : new Date(dto.endsAt),
      dto.registrationStartsAt === undefined
        ? null
        : new Date(dto.registrationStartsAt),
      dto.registrationEndsAt === undefined
        ? null
        : new Date(dto.registrationEndsAt),
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

  async update(
    organizationId: number,
    id: number,
    dto: UpdateTournamentDto,
  ): Promise<TournamentResponseDto> {
    const existing = await this.findRowOrThrow(organizationId, id);

    if (
      existing.status === TournamentStatus.COMPLETED &&
      dto.status !== undefined
    ) {
      throw ApiException.conflict(
        'A completed tournament cannot change status here. Use POST /tournaments/:id/reopen.',
        'INVALID_STATUS_TRANSITION',
      );
    }

    // A declared champion was validated against the format that produced it: GROUP_STAGE
    // admits none, and a knockout champion had to win a slot. Editing the format under a
    // stored champion strands a title /complete would have refused (domain rules §3).
    if (
      dto.format !== undefined &&
      dto.format !== existing.format &&
      existing.championTournamentTeamId !== null
    ) {
      throw ApiException.unprocessable(
        'A tournament with a declared champion cannot change format. Reopen it first.',
        'INVALID_CHAMPION',
      );
    }

    const mergedStartsAt =
      dto.startsAt === undefined
        ? existing.startsAt
        : dto.startsAt === null
          ? null
          : new Date(dto.startsAt);
    const mergedEndsAt =
      dto.endsAt === undefined
        ? existing.endsAt
        : dto.endsAt === null
          ? null
          : new Date(dto.endsAt);
    const mergedRegistrationStartsAt =
      dto.registrationStartsAt === undefined
        ? existing.registrationStartsAt
        : dto.registrationStartsAt === null
          ? null
          : new Date(dto.registrationStartsAt);
    const mergedRegistrationEndsAt =
      dto.registrationEndsAt === undefined
        ? existing.registrationEndsAt
        : dto.registrationEndsAt === null
          ? null
          : new Date(dto.registrationEndsAt);

    this.assertDateRanges(
      mergedStartsAt,
      mergedEndsAt,
      mergedRegistrationStartsAt,
      mergedRegistrationEndsAt,
    );

    if (dto.seasonId !== undefined) {
      await this.assertSeason(organizationId, dto.seasonId);
    }

    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.assertCategory(organizationId, dto.categoryId);
    }

    let slug: string | undefined;
    if (dto.slug !== undefined) {
      slug = this.normalizeExplicitSlug(dto.slug);
      const conflict = await this.prisma.tournament.findFirst({
        where: { organizationId, slug, isDeleted: false, id: { not: id } },
        select: { id: true },
      });
      if (conflict) {
        throw ApiException.conflict(
          'A tournament with this slug already exists.',
          'DUPLICATE_RECORD',
        );
      }
    }

    const row = await this.prisma.tournament.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.seasonId === undefined ? {} : { seasonId: dto.seasonId }),
        ...(dto.format === undefined ? {} : { format: dto.format }),
        ...(slug === undefined ? {} : { slug }),
        ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
        ...(dto.regulation === undefined ? {} : { regulation: dto.regulation }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.startsAt === undefined ? {} : { startsAt: mergedStartsAt }),
        ...(dto.endsAt === undefined ? {} : { endsAt: mergedEndsAt }),
        ...(dto.registrationStartsAt === undefined
          ? {}
          : { registrationStartsAt: mergedRegistrationStartsAt }),
        ...(dto.registrationEndsAt === undefined
          ? {}
          : { registrationEndsAt: mergedRegistrationEndsAt }),
      },
      select: tournamentSelect,
    });

    const matchCounts = await this.loadMatchCounts([row.id]);
    return this.toResponse(
      row,
      matchCounts.get(row.id) ?? { total: 0, finished: 0 },
    );
  }

  async complete(
    organizationId: number,
    id: number,
    dto: CompleteTournamentDto,
  ): Promise<TournamentResponseDto> {
    const row = await this.runSerializable((tx) =>
      this.completeTransaction(tx, organizationId, id, dto),
    );

    const matchCounts = await this.loadMatchCounts([row.id]);
    return this.toResponse(
      row,
      matchCounts.get(row.id) ?? { total: 0, finished: 0 },
    );
  }

  private async completeTransaction(
    tx: Prisma.TransactionClient,
    organizationId: number,
    id: number,
    dto: CompleteTournamentDto,
  ): Promise<TournamentRow> {
    const existing = await tx.tournament.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { id: true, status: true, format: true },
    });

    if (!existing) throw ApiException.notFound('Tournament not found');

    if (existing.status !== TournamentStatus.IN_PROGRESS) {
      throw ApiException.conflict(
        'Only a tournament in progress can be completed.',
        'INVALID_STATUS_TRANSITION',
      );
    }

    const champion = dto.championTournamentTeamId ?? null;
    await this.assertChampionForFormat(
      tx,
      organizationId,
      id,
      existing.format,
      champion,
    );

    return tx.tournament.update({
      where: { id },
      data: {
        status: TournamentStatus.COMPLETED,
        championTournamentTeamId: champion,
      },
      select: tournamentSelect,
    });
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let retry = 0; retry <= 3; retry += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isPrismaError(error, 'P2034')) throw error;
        if (retry === 3) throw this.concurrentModification();
      }
    }
    throw this.concurrentModification();
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }

  private concurrentModification(): ApiException {
    return ApiException.conflict(
      'The resource changed during this operation. Retry the request.',
      'CONCURRENT_MODIFICATION',
    );
  }

  async reopen(
    organizationId: number,
    id: number,
  ): Promise<TournamentResponseDto> {
    const existing = await this.prisma.tournament.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { id: true, status: true },
    });

    if (!existing) throw ApiException.notFound('Tournament not found');

    if (existing.status !== TournamentStatus.COMPLETED) {
      throw ApiException.conflict(
        'Only a completed tournament can be reopened.',
        'INVALID_STATUS_TRANSITION',
      );
    }

    // A concurrent second reopen would rewrite the same values, which is harmless.
    const row = await this.prisma.tournament.update({
      where: { id },
      data: {
        status: TournamentStatus.IN_PROGRESS,
        championTournamentTeamId: null,
      },
      select: tournamentSelect,
    });

    const matchCounts = await this.loadMatchCounts([row.id]);
    return this.toResponse(
      row,
      matchCounts.get(row.id) ?? { total: 0, finished: 0 },
    );
  }

  async championSuggestion(
    organizationId: number,
    id: number,
  ): Promise<ChampionSuggestionResponseDto> {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: { id: true, format: true },
    });

    if (!tournament) throw ApiException.notFound('Tournament not found');

    if (tournament.format === TournamentFormat.GROUP_STAGE) {
      return { championTournamentTeamId: null };
    }

    // TODO(matheusecke): suggest position 1 when standingsState is FINAL — needs
    // StandingsService (docs/sports-domain-rules.md §5).
    if (tournament.format === TournamentFormat.LEAGUE) {
      return { championTournamentTeamId: null };
    }

    const slots = await this.prisma.tournamentBracketSlot.findMany({
      where: { tournamentId: id, isDeleted: false },
      select: {
        winnerTournamentTeamId: true,
        round: { select: { number: true } },
      },
    });

    if (slots.length === 0) return { championTournamentTeamId: null };

    const highest = Math.max(...slots.map((slot) => slot.round.number));
    const finalSlots = slots.filter((slot) => slot.round.number === highest);

    // Exactly one slot in the top round is the only shape that lets the system
    // assert a final. Two slots means semifinals-in-progress or a third-place
    // playoff — both legitimate, neither answerable (domain rules §3).
    return {
      championTournamentTeamId:
        finalSlots.length === 1 ? finalSlots[0].winnerTournamentTeamId : null,
    };
  }

  // "Havendo mata-mata" is a property of the format, not of the current structure:
  // a KNOCKOUT tournament with no decided slot has no champion to declare yet.
  private async assertChampionForFormat(
    tx: Prisma.TransactionClient,
    organizationId: number,
    tournamentId: number,
    format: TournamentFormat,
    championTournamentTeamId: number | null,
  ): Promise<void> {
    if (format === TournamentFormat.GROUP_STAGE) {
      if (championTournamentTeamId !== null) {
        throw ApiException.unprocessable(
          'A group stage tournament has no champion.',
          'CHAMPION_NOT_ALLOWED',
        );
      }
      return;
    }

    if (championTournamentTeamId === null) {
      throw ApiException.unprocessable(
        'championTournamentTeamId is required for this format.',
        'CHAMPION_REQUIRED',
      );
    }

    const team = await tx.tournamentTeam.findFirst({
      where: {
        id: championTournamentTeamId,
        tournamentId,
        organizationId,
        status: TournamentTeamStatus.ACTIVE,
        isDeleted: false,
      },
      select: { id: true },
    });

    if (!team) {
      throw ApiException.unprocessable(
        'The champion must be a team actively enrolled in this tournament.',
        'INVALID_CHAMPION',
      );
    }

    const requiresBracketWin =
      format === TournamentFormat.KNOCKOUT ||
      format === TournamentFormat.GROUP_STAGE_KNOCKOUT;

    if (requiresBracketWin) {
      // Winning any slot qualifies (domain rules §3) — not necessarily the highest round.
      const slot = await tx.tournamentBracketSlot.findFirst({
        where: {
          tournamentId,
          winnerTournamentTeamId: championTournamentTeamId,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (!slot) {
        throw ApiException.unprocessable(
          'The champion must have won a bracket slot.',
          'INVALID_CHAMPION',
        );
      }
    }
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

  async leaders(
    organizationId: number,
    id: number,
  ): Promise<TournamentLeadersResponseDto> {
    await this.findRowOrThrow(organizationId, id);
    const rows = await this.prisma.playerMatchStatistic.findMany({
      where: {
        organizationId,
        isDeleted: false,
        user: { is: { isDeleted: false } },
        match: {
          organizationId,
          tournamentId: id,
          status: MatchStatus.FINISHED,
          isDeleted: false,
          tournament: { is: { organizationId, isDeleted: false } },
        },
        matchTeam: {
          organizationId,
          isDeleted: false,
          tournamentTeam: {
            is: {
              organizationId,
              tournamentId: id,
              isDeleted: false,
              team: { is: { isDeleted: false } },
            },
          },
        },
        tournamentRoster: {
          organizationId,
          tournamentId: id,
          role: RosterRole.ATHLETE,
          isDeleted: false,
          tournament: { is: { organizationId, isDeleted: false } },
          tournamentTeam: {
            is: {
              organizationId,
              tournamentId: id,
              isDeleted: false,
              team: { is: { isDeleted: false } },
            },
          },
        },
      },
      select: leaderStatisticSelect,
    });
    const groups = new Map<number, typeof rows>();
    for (const row of rows) {
      const group = groups.get(row.tournamentRosterId);
      if (group) group.push(row);
      else groups.set(row.tournamentRosterId, [row]);
    }
    return this.statistics.rankLeaders(
      [...groups.values()].map((group) => {
        const first = group[0];
        return {
          athleteId: first.userId,
          athleteName: first.tournamentRoster.displayNameSnapshot,
          tournamentRosterId: first.tournamentRosterId,
          tournamentTeamId: first.tournamentRoster.tournamentTeamId,
          teamId: first.tournamentRoster.tournamentTeam.teamId,
          teamName: first.tournamentRoster.tournamentTeam.displayNameSnapshot,
          statistics: group,
        };
      }),
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
    startsAt: Date | null,
    endsAt: Date | null,
    registrationStartsAt: Date | null,
    registrationEndsAt: Date | null,
  ): void {
    if (
      startsAt !== null &&
      endsAt !== null &&
      startsAt.getTime() > endsAt.getTime()
    ) {
      throw ApiException.unprocessable(
        'startsAt must be on or before endsAt.',
        'INVALID_DATE_RANGE',
      );
    }

    if (
      registrationStartsAt !== null &&
      registrationEndsAt !== null &&
      registrationStartsAt.getTime() > registrationEndsAt.getTime()
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

  // slugify() drops every character it cannot represent, so an input made only of
  // punctuation ('!!!') collapses to an empty string the lowercase check constraint
  // happily stores — and the next one collides with a slug nobody can see.
  private normalizeExplicitSlug(explicitSlug: string): string {
    const slug = slugify(explicitSlug);

    if (slug === '') {
      throw ApiException.unprocessable(
        'slug must contain at least one letter or digit.',
        'INVALID_SLUG',
      );
    }

    return slug;
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
      const slug = this.normalizeExplicitSlug(explicitSlug);
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
