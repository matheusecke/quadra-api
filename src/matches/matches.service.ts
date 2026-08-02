import { Injectable, Logger } from '@nestjs/common';
import {
  LossType,
  MatchResult,
  MatchRosterStatus,
  MatchSide,
  MatchStatus,
  PeriodType,
  Prisma,
  RosterRole,
  TournamentFormat,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListMatchesQueryDto,
  ListTournamentMatchesQueryDto,
} from './dto/list-matches-query.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import {
  MatchPeriodInputDto,
  MatchPlayerStatisticInputDto,
  SaveMatchDraftDto,
  SubmitMatchResultDto,
} from './dto/match-scoresheet.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import {
  MatchDetailResponseDto,
  MatchScoreSource,
  MatchSummaryResponseDto,
  MatchTeamResponseDto,
  PlayerMatchStatisticResponseDto,
} from './dto/match-response.dto';

const matchTeamReadSelect = {
  side: true,
  tournamentTeamId: true,
  finalScore: true,
  result: true,
  lossType: true,
  isWinner: true,
  tournamentTeam: { select: { displayNameSnapshot: true } },
} satisfies Prisma.MatchTeamSelect;

export const matchSummarySelect = {
  id: true,
  tournamentId: true,
  tournamentGroupId: true,
  matchNumber: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  endedAt: true,
  venueName: true,
  teams: {
    where: { isDeleted: false },
    select: matchTeamReadSelect,
  },
  periods: {
    where: { isDeleted: false },
    select: { homePoints: true, awayPoints: true },
  },
  bracketSlots: {
    where: {
      isDeleted: false,
      round: { is: { isDeleted: false } },
    },
    orderBy: [{ id: 'asc' }],
    take: 1,
    select: {
      round: { select: { id: true, number: true, label: true } },
    },
  },
} satisfies Prisma.MatchSelect;

export const matchDetailSelect = {
  ...matchSummarySelect,
  periods: {
    where: { isDeleted: false },
    orderBy: [{ periodNumber: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      periodNumber: true,
      periodType: true,
      homePoints: true,
      awayPoints: true,
      startedAt: true,
      endedAt: true,
    },
  },
  playerStatistics: {
    where: { isDeleted: false },
    select: {
      tournamentRosterId: true,
      pts: true,
      fgm: true,
      fga: true,
      threeFgm: true,
      threeFga: true,
      ftm: true,
      fta: true,
      reb: true,
      ast: true,
      stl: true,
      blk: true,
      tov: true,
      pf: true,
      minutesSeconds: true,
      matchTeam: { select: { side: true } },
      matchRoster: {
        select: { displayNameSnapshot: true, isDeleted: true },
      },
      tournamentRoster: {
        select: {
          tournamentTeamId: true,
          displayNameSnapshot: true,
        },
      },
    },
  },
  mvpMatchRoster: {
    select: {
      tournamentRosterId: true,
      displayNameSnapshot: true,
      isDeleted: true,
    },
  },
} satisfies Prisma.MatchSelect;

export const matchUpdateTargetSelect = {
  id: true,
  tournamentId: true,
  tournamentGroupId: true,
  matchNumber: true,
  scheduledAt: true,
  venueName: true,
  status: true,
  tournament: { select: { format: true } },
  teams: {
    where: { isDeleted: false },
    select: { id: true, side: true, tournamentTeamId: true },
  },
  bracketSlots: {
    where: { isDeleted: false },
    orderBy: [{ id: 'asc' }],
    take: 1,
    select: {
      id: true,
      homeTournamentTeamId: true,
      awayTournamentTeamId: true,
    },
  },
} satisfies Prisma.MatchSelect;

export const matchScoresheetTargetSelect = {
  id: true,
  tournamentId: true,
  status: true,
  startedAt: true,
  mvpMatchRosterId: true,
  tournament: { select: { status: true } },
  teams: {
    where: { isDeleted: false },
    select: { id: true, side: true, tournamentTeamId: true },
  },
  playerStatistics: {
    where: { isDeleted: false },
    select: {
      tournamentRosterId: true,
      matchRosterId: true,
      matchRoster: {
        select: { id: true, status: true, isDeleted: true },
      },
    },
  },
  mvpMatchRoster: {
    select: { tournamentRosterId: true, isDeleted: true },
  },
  bracketSlots: {
    where: { isDeleted: false },
    orderBy: [{ id: 'asc' }],
    take: 1,
    select: {
      id: true,
      homeTournamentTeamId: true,
      awayTournamentTeamId: true,
      winnerTournamentTeamId: true,
    },
  },
} satisfies Prisma.MatchSelect;

type MatchSummaryRow = Prisma.MatchGetPayload<{
  select: typeof matchSummarySelect;
}>;
type MatchDetailRow = Prisma.MatchGetPayload<{
  select: typeof matchDetailSelect;
}>;
type MatchUpdateTarget = Prisma.MatchGetPayload<{
  select: typeof matchUpdateTargetSelect;
}>;
type MatchScoresheetTarget = Prisma.MatchGetPayload<{
  select: typeof matchScoresheetTargetSelect;
}>;

const playerStatisticMetricKeys = [
  'pts',
  'fgm',
  'fga',
  'threeFgm',
  'threeFga',
  'ftm',
  'fta',
  'reb',
  'ast',
  'stl',
  'blk',
  'tov',
  'pf',
  'minutesSeconds',
] as const;

type PlayerStatisticMetric = (typeof playerStatisticMetricKeys)[number];
type NormalizedPlayerStatistic = {
  tournamentRosterId: number;
} & Record<PlayerStatisticMetric, number | null>;

const tournamentRosterForMatchSelect = {
  id: true,
  tournamentId: true,
  tournamentTeamId: true,
  userId: true,
  role: true,
  jerseyNumberSnapshot: true,
  displayNameSnapshot: true,
} satisfies Prisma.TournamentRosterSelect;

type TournamentRosterForMatch = Prisma.TournamentRosterGetPayload<{
  select: typeof tournamentRosterForMatchSelect;
}>;

type ResolvedPlayerStatistic = NormalizedPlayerStatistic & {
  tournamentRoster: TournamentRosterForMatch;
  matchTeamId: number;
};

type DerivedMatchTeamResult = {
  matchTeamId: number;
  tournamentTeamId: number;
  finalScore: number;
  result: MatchResult;
  lossType: LossType | null;
  isWinner: boolean;
};

type DerivedMatchResult = {
  home: DerivedMatchTeamResult;
  away: DerivedMatchTeamResult;
  winnerTournamentTeamId: number;
  scoreSource: MatchScoreSource;
};

type ResultCommitSummary = {
  result: DerivedMatchResult;
  playerPoints: Record<MatchSide, number> | null;
};

// NOTE: Prisma 7 generates enums as a const object plus a string-literal
// union type, not a namespace, so `LossType.NORMAL` cannot be used in a
// type position (`LossType.NORMAL | LossType.DEFAULT` is TS2702). This
// alias expresses the same "played result" subset as a valid type.
type PlayedResultType = Exclude<LossType, typeof LossType.FORFEIT>;

type MatchClient = Pick<
  Prisma.TransactionClient,
  | 'match'
  | 'matchTeam'
  | 'tournament'
  | 'tournamentGroup'
  | 'tournamentTeam'
  | 'tournamentGroupTeam'
  | 'tournamentRoster'
  | 'tournamentBracketSlot'
  | 'matchPeriod'
  | 'matchRoster'
  | 'playerMatchStatistic'
>;

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: number,
    query: ListMatchesQueryDto,
  ): Promise<{ count: number; data: MatchSummaryResponseDto[] }> {
    return this.list(organizationId, query);
  }

  async findAllByTournament(
    organizationId: number,
    tournamentId: number,
    query: ListTournamentMatchesQueryDto,
  ): Promise<{ count: number; data: MatchSummaryResponseDto[] }> {
    await this.findTournamentOrThrow(organizationId, tournamentId);
    return this.list(organizationId, query, tournamentId);
  }

  private async findTournamentOrThrow(
    organizationId: number,
    tournamentId: number,
  ): Promise<{
    id: number;
    format: TournamentFormat;
    status: TournamentStatus;
  }> {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, organizationId, isDeleted: false },
      select: { id: true, format: true, status: true },
    });
    if (!tournament) throw ApiException.notFound('Tournament not found');
    return tournament;
  }

  private async list(
    organizationId: number,
    query: ListMatchesQueryDto | ListTournamentMatchesQueryDto,
    tournamentId?: number,
  ): Promise<{ count: number; data: MatchSummaryResponseDto[] }> {
    const where = this.buildWhere(organizationId, query, tournamentId);
    const [count, rows] = await Promise.all([
      this.prisma.match.count({ where }),
      this.prisma.match.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        select: matchSummarySelect,
      }),
    ]);
    return { count, data: rows.map((row) => this.toSummary(row)) };
  }

  private buildWhere(
    organizationId: number,
    query: ListMatchesQueryDto | ListTournamentMatchesQueryDto,
    tournamentId?: number,
  ): Prisma.MatchWhereInput {
    const filters: Prisma.MatchWhereInput[] = [];
    if (query.q) {
      filters.push({
        teams: {
          some: {
            isDeleted: false,
            tournamentTeam: {
              displayNameSnapshot: {
                contains: query.q,
                mode: 'insensitive',
              },
            },
          },
        },
      });
    }
    if (query.tournamentTeamIds) {
      filters.push({
        teams: {
          some: {
            isDeleted: false,
            tournamentTeamId: { in: query.tournamentTeamIds },
          },
        },
      });
    }
    return {
      organizationId,
      isDeleted: false,
      tournament: { organizationId, isDeleted: false },
      ...(query.ids ? { id: { in: query.ids } } : {}),
      ...(tournamentId !== undefined
        ? { tournamentId }
        : 'tournamentId' in query && query.tournamentId !== undefined
          ? { tournamentId: query.tournamentId }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(filters.length > 0 ? { AND: filters } : {}),
    };
  }

  private toSummary(row: MatchSummaryRow): MatchSummaryResponseDto {
    const isFinished = row.status === MatchStatus.FINISHED;
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      tournamentGroupId: row.tournamentGroupId,
      matchNumber: row.matchNumber,
      status: row.status,
      scheduledAt: row.scheduledAt,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      venueName: row.venueName,
      bracketRound: row.bracketSlots[0]?.round ?? null,
      scoreSource: this.deriveScoreSource(row),
      homeTeam: this.toTeam(row, MatchSide.HOME, isFinished),
      awayTeam: this.toTeam(row, MatchSide.AWAY, isFinished),
    };
  }

  private toTeam(
    row: MatchSummaryRow,
    side: MatchSide,
    includeResult: boolean,
  ): MatchTeamResponseDto {
    const team = row.teams.find((candidate) => candidate.side === side);
    if (!team) {
      throw new Error(`Active ${side} MatchTeam invariant violated`);
    }
    return {
      tournamentTeamId: team.tournamentTeamId,
      teamName: team.tournamentTeam.displayNameSnapshot,
      score: includeResult ? team.finalScore : null,
      result: includeResult ? team.result : null,
      lossType: includeResult ? team.lossType : null,
      isWinner: includeResult ? team.isWinner : null,
    };
  }

  async findOne(
    organizationId: number,
    id: number,
  ): Promise<MatchDetailResponseDto> {
    const row = await this.findMatchOrThrow(organizationId, id);
    return this.toDetail(row);
  }

  private async findMatchOrThrow(
    organizationId: number,
    id: number,
  ): Promise<MatchDetailRow> {
    const row = await this.prisma.match.findFirst({
      where: {
        id,
        organizationId,
        isDeleted: false,
        tournament: { organizationId, isDeleted: false },
      },
      select: matchDetailSelect,
    });
    if (!row) throw ApiException.notFound('Match not found');
    return row;
  }

  private toDetail(row: MatchDetailRow): MatchDetailResponseDto {
    // NOTE: only a FINISHED forfeit masks scoresheet rows. Reopen changes the
    // lifecycle to LIVE and must expose every preserved raw fact.
    const isForfeit =
      row.status === MatchStatus.FINISHED &&
      row.teams.some((team) => team.lossType === LossType.FORFEIT);
    const periods = isForfeit
      ? []
      : [...row.periods]
          .sort(
            (left, right) =>
              left.periodNumber - right.periodNumber || left.id - right.id,
          )
          .map((period) => ({
            periodNumber: period.periodNumber,
            periodType: period.periodType,
            homePoints: period.homePoints,
            awayPoints: period.awayPoints,
            startedAt: period.startedAt,
            endedAt: period.endedAt,
          }));
    const playerStats = isForfeit
      ? []
      : row.playerStatistics
          .map((stat) => this.toPlayerStat(stat))
          .sort(
            (left, right) =>
              left.sideOrder - right.sideOrder ||
              left.value.displayName.localeCompare(right.value.displayName) ||
              left.value.tournamentRosterId - right.value.tournamentRosterId,
          )
          .map(({ value }) => value);
    return {
      ...this.toSummary(row),
      periods,
      playerStats,
      mvp:
        !isForfeit && row.mvpMatchRoster && !row.mvpMatchRoster.isDeleted
          ? {
              tournamentRosterId: row.mvpMatchRoster.tournamentRosterId,
              displayName: row.mvpMatchRoster.displayNameSnapshot,
            }
          : null,
    };
  }

  private toPlayerStat(stat: MatchDetailRow['playerStatistics'][number]): {
    sideOrder: number;
    value: PlayerMatchStatisticResponseDto;
  } {
    const { matchTeam, matchRoster, tournamentRoster, ...metrics } = stat;
    return {
      sideOrder: matchTeam.side === MatchSide.HOME ? 0 : 1,
      value: {
        ...metrics,
        tournamentTeamId: tournamentRoster.tournamentTeamId,
        displayName:
          matchRoster && !matchRoster.isDeleted
            ? matchRoster.displayNameSnapshot
            : tournamentRoster.displayNameSnapshot,
      },
    };
  }

  private deriveScoreSource(row: MatchSummaryRow): MatchScoreSource | null {
    if (row.status !== MatchStatus.FINISHED) return null;
    if (row.teams.some((team) => team.lossType === LossType.FORFEIT)) {
      return 'AWARDED';
    }
    if (row.teams.some((team) => team.lossType === LossType.DEFAULT)) {
      const homeTotal = row.periods.reduce(
        (total, period) => total + period.homePoints,
        0,
      );
      const awayTotal = row.periods.reduce(
        (total, period) => total + period.awayPoints,
        0,
      );
      const home = row.teams.find((team) => team.side === MatchSide.HOME);
      const away = row.teams.find((team) => team.side === MatchSide.AWAY);
      if (home?.finalScore !== homeTotal || away?.finalScore !== awayTotal) {
        return 'AWARDED';
      }
    }
    return 'PERIODS';
  }

  async create(
    organizationId: number,
    userId: number,
    dto: CreateMatchDto,
  ): Promise<MatchDetailResponseDto> {
    const tournament = await this.findTournamentOrThrow(
      organizationId,
      dto.tournamentId,
    );
    this.assertTournamentAcceptsMatches(tournament.status);
    await this.validateGroup(
      this.prisma,
      organizationId,
      tournament.id,
      tournament.format,
      dto.tournamentGroupId ?? null,
    );
    await this.validateParticipant(
      this.prisma,
      organizationId,
      tournament.id,
      dto.homeTournamentTeamId,
    );
    await this.validateParticipant(
      this.prisma,
      organizationId,
      tournament.id,
      dto.awayTournamentTeamId,
    );
    this.assertDistinctParticipants(
      dto.homeTournamentTeamId,
      dto.awayTournamentTeamId,
    );
    await this.assertGroupMemberships(
      this.prisma,
      organizationId,
      tournament.id,
      dto.tournamentGroupId ?? null,
      dto.homeTournamentTeamId,
      dto.awayTournamentTeamId,
    );

    const row = await this.prisma.match.create({
      data: {
        organizationId,
        tournamentId: dto.tournamentId,
        tournamentGroupId: dto.tournamentGroupId ?? null,
        matchNumber: dto.matchNumber ?? null,
        scheduledAt: new Date(dto.scheduledAt),
        venueName: dto.venueName ?? null,
        status: MatchStatus.SCHEDULED,
        createdByUserId: userId,
        teams: {
          create: [
            {
              organizationId,
              tournamentTeamId: dto.homeTournamentTeamId,
              side: MatchSide.HOME,
            },
            {
              organizationId,
              tournamentTeamId: dto.awayTournamentTeamId,
              side: MatchSide.AWAY,
            },
          ],
        },
      },
      select: matchDetailSelect,
    });
    return this.toDetail(row);
  }

  private assertTournamentAcceptsMatches(status: TournamentStatus): void {
    if (
      status === TournamentStatus.COMPLETED ||
      status === TournamentStatus.CANCELLED
    ) {
      throw ApiException.conflict(
        'Matches cannot be created for a completed or cancelled tournament.',
        'TOURNAMENT_NOT_MUTABLE',
      );
    }
  }

  private async validateGroup(
    client: MatchClient,
    organizationId: number,
    tournamentId: number,
    format: TournamentFormat,
    tournamentGroupId: number | null,
  ): Promise<void> {
    if (tournamentGroupId === null) return;
    if (
      format !== TournamentFormat.GROUP_STAGE &&
      format !== TournamentFormat.GROUP_STAGE_KNOCKOUT
    ) {
      throw ApiException.unprocessable(
        'This tournament format does not have a group stage.',
        'INVALID_TOURNAMENT_FORMAT',
      );
    }
    const group = await client.tournamentGroup.findFirst({
      where: { id: tournamentGroupId, organizationId, isDeleted: false },
      select: { id: true, tournamentId: true },
    });
    if (!group) throw ApiException.notFound('Tournament group not found');
    if (group.tournamentId !== tournamentId) {
      throw ApiException.unprocessable(
        'The tournament group must belong to the match tournament.',
        'INVALID_GROUP_ASSIGNMENT',
      );
    }
  }

  private async validateParticipant(
    client: MatchClient,
    organizationId: number,
    tournamentId: number,
    tournamentTeamId: number,
  ): Promise<void> {
    const registration = await client.tournamentTeam.findFirst({
      where: { id: tournamentTeamId, organizationId, isDeleted: false },
      select: { id: true, tournamentId: true, status: true },
    });
    if (!registration) {
      throw ApiException.notFound('Tournament team not found');
    }
    if (registration.status !== TournamentTeamStatus.ACTIVE) {
      throw ApiException.unprocessable(
        'The tournament team registration is not active.',
        'INACTIVE_REGISTRATION',
      );
    }
    if (registration.tournamentId !== tournamentId) {
      throw ApiException.unprocessable(
        'The tournament team registration must belong to the match tournament.',
        'INVALID_MATCH_ASSIGNMENT',
      );
    }
  }

  private assertDistinctParticipants(homeId: number, awayId: number): void {
    if (homeId === awayId) {
      throw ApiException.unprocessable(
        'A match cannot have the same team on both sides.',
        'SAME_TEAM_IN_MATCH',
      );
    }
  }

  private async assertGroupMemberships(
    client: MatchClient,
    organizationId: number,
    tournamentId: number,
    tournamentGroupId: number | null,
    homeId: number,
    awayId: number,
  ): Promise<void> {
    if (tournamentGroupId === null) return;
    const membershipWhere = (tournamentTeamId: number) => ({
      organizationId,
      tournamentId,
      tournamentGroupId,
      tournamentTeamId,
      isDeleted: false,
    });
    const home = await client.tournamentGroupTeam.findFirst({
      where: membershipWhere(homeId),
      select: { id: true },
    });
    const away = await client.tournamentGroupTeam.findFirst({
      where: membershipWhere(awayId),
      select: { id: true },
    });
    if (!home || !away) {
      throw ApiException.unprocessable(
        'Both match participants must belong to the selected tournament group.',
        'INVALID_GROUP_ASSIGNMENT',
      );
    }
  }

  async draft(
    organizationId: number,
    id: number,
    dto: SaveMatchDraftDto,
  ): Promise<MatchDetailResponseDto> {
    await this.runSerializable((tx) =>
      this.saveDraft(tx, organizationId, id, dto),
    );
    return this.findOne(organizationId, id);
  }

  async submitResult(
    organizationId: number,
    id: number,
    dto: SubmitMatchResultDto,
  ): Promise<MatchDetailResponseDto> {
    const summary = await this.runSerializable((tx) =>
      this.saveResult(tx, organizationId, id, dto),
    );
    this.warnPointsMismatch(id, summary);
    return this.findOne(organizationId, id);
  }

  async reopen(
    organizationId: number,
    id: number,
  ): Promise<MatchDetailResponseDto> {
    await this.runSerializable((tx) =>
      this.reopenMatch(tx, organizationId, id),
    );
    return this.findOne(organizationId, id);
  }

  private async saveDraft(
    tx: MatchClient,
    organizationId: number,
    id: number,
    dto: SaveMatchDraftDto,
  ): Promise<void> {
    const current = await this.findScoresheetTargetOrThrow(
      tx,
      organizationId,
      id,
    );
    this.assertScoresheetTournamentMutable(current.tournament.status);
    this.assertDraftAllowed(current.status);
    this.assertPeriodStructure(dto.periods);

    const normalizedStats =
      dto.playerStats === undefined
        ? undefined
        : this.normalizePlayerStatistics(dto.playerStats);
    const resolvedStats =
      normalizedStats === undefined
        ? undefined
        : await this.resolvePlayerStatistics(
            tx,
            organizationId,
            current,
            normalizedStats,
          );
    const updatesMvp =
      dto.playerStats !== undefined || dto.mvpTournamentRosterId !== undefined;
    const resultingMvpTournamentRosterId = updatesMvp
      ? this.resolveResultingMvpTournamentRosterId(
          current,
          dto.mvpTournamentRosterId,
          normalizedStats,
        )
      : null;
    const existingMvpMatchRosterId =
      updatesMvp && normalizedStats === undefined
        ? this.findExistingMvpMatchRosterId(
            current,
            resultingMvpTournamentRosterId,
          )
        : null;

    if (dto.periods !== undefined) {
      await this.replacePeriods(tx, organizationId, id, dto.periods);
    }

    const createdRosterIds =
      resolvedStats === undefined
        ? undefined
        : await this.replacePlayerStatistics(
            tx,
            organizationId,
            current,
            resolvedStats,
          );
    const mvpMatchRosterId =
      resultingMvpTournamentRosterId === null
        ? null
        : (createdRosterIds?.get(resultingMvpTournamentRosterId) ??
          existingMvpMatchRosterId);
    const now = new Date();
    await tx.match.update({
      where: { id },
      data: {
        status: MatchStatus.LIVE,
        startedAt: current.startedAt ?? now,
        endedAt: null,
        ...(updatesMvp ? { mvpMatchRosterId } : {}),
      },
    });
  }

  private async saveResult(
    tx: MatchClient,
    organizationId: number,
    id: number,
    dto: SubmitMatchResultDto,
  ): Promise<ResultCommitSummary> {
    const current = await this.findScoresheetTargetOrThrow(
      tx,
      organizationId,
      id,
    );
    this.assertScoresheetTournamentMutable(current.tournament.status);
    this.assertResultAllowed(current.status);

    const resultType = dto.resultType ?? LossType.NORMAL;
    if (resultType === LossType.FORFEIT) {
      this.assertForfeitResultPayload(dto);
      const winnerTournamentTeamId = this.findNonOffendingTournamentTeamId(
        current,
        dto.offendingTournamentTeamId,
      );
      const home = this.findMatchSide(current, MatchSide.HOME);
      const away = this.findMatchSide(current, MatchSide.AWAY);
      const result = this.buildDerivedResult(
        home,
        away,
        winnerTournamentTeamId === home.tournamentTeamId ? 20 : 0,
        winnerTournamentTeamId === away.tournamentTeamId ? 20 : 0,
        winnerTournamentTeamId,
        LossType.FORFEIT,
        'AWARDED',
      );
      const linkedSlot = this.assertLinkedSlotMatchesParticipants(current);

      await this.replacePeriods(tx, organizationId, id, []);
      await this.replacePlayerStatistics(tx, organizationId, current, []);
      await this.writeOfficialResult(tx, result);
      const now = new Date();
      await tx.match.update({
        where: { id },
        data: {
          status: MatchStatus.FINISHED,
          startedAt: null,
          endedAt: now,
          mvpMatchRosterId: null,
        },
      });
      await this.synchronizeLinkedSlotWinner(
        tx,
        current,
        linkedSlot,
        result.winnerTournamentTeamId,
      );
      return { result, playerPoints: null };
    }
    this.assertPlayedResultPayload(dto, resultType);
    this.assertPeriodStructure(dto.periods);
    this.assertPlayedResultPeriods(dto.periods, resultType);
    const nonOffendingTournamentTeamId =
      resultType === LossType.DEFAULT
        ? this.findNonOffendingTournamentTeamId(
            current,
            dto.offendingTournamentTeamId,
          )
        : undefined;

    const normalizedStats = this.normalizePlayerStatistics(dto.playerStats);
    const resolvedStats = await this.resolvePlayerStatistics(
      tx,
      organizationId,
      current,
      normalizedStats,
    );
    const resultingMvpTournamentRosterId =
      this.resolveResultingMvpTournamentRosterId(
        current,
        dto.mvpTournamentRosterId,
        normalizedStats,
      );
    const result = this.derivePlayedResult(
      current,
      dto.periods,
      resultType,
      nonOffendingTournamentTeamId,
    );
    const linkedSlot = this.assertLinkedSlotMatchesParticipants(current);

    await this.replacePeriods(tx, organizationId, id, dto.periods);
    const createdRosterIds = await this.replacePlayerStatistics(
      tx,
      organizationId,
      current,
      resolvedStats,
    );
    const mvpMatchRosterId =
      resultingMvpTournamentRosterId === null
        ? null
        : (createdRosterIds.get(resultingMvpTournamentRosterId) ??
          this.invalidMvp());

    await this.writeOfficialResult(tx, result);
    const now = new Date();
    await tx.match.update({
      where: { id },
      data: {
        status: MatchStatus.FINISHED,
        startedAt: current.startedAt ?? now,
        endedAt: now,
        mvpMatchRosterId,
      },
    });
    await this.synchronizeLinkedSlotWinner(
      tx,
      current,
      linkedSlot,
      result.winnerTournamentTeamId,
    );

    return {
      result,
      playerPoints: this.sumPlayerPoints(resolvedStats, result),
    };
  }

  private async reopenMatch(
    tx: MatchClient,
    organizationId: number,
    id: number,
  ): Promise<void> {
    const current = await this.findScoresheetTargetOrThrow(
      tx,
      organizationId,
      id,
    );
    this.assertScoresheetTournamentMutable(current.tournament.status);
    this.assertReopenAllowed(current.status);

    await tx.matchTeam.updateMany({
      where: { matchId: id, organizationId, isDeleted: false },
      data: {
        finalScore: null,
        result: null,
        lossType: null,
        isWinner: null,
      },
    });
    await tx.match.update({
      where: { id },
      data: {
        status: MatchStatus.LIVE,
        endedAt: null,
      },
    });
  }

  private async replacePeriods(
    tx: MatchClient,
    organizationId: number,
    matchId: number,
    periods: MatchPeriodInputDto[],
  ): Promise<void> {
    await tx.matchPeriod.updateMany({
      where: { matchId, organizationId, isDeleted: false },
      data: { isDeleted: true },
    });
    if (periods.length === 0) return;
    await tx.matchPeriod.createMany({
      data: periods.map((period) => ({
        organizationId,
        matchId,
        periodNumber: period.periodNumber,
        periodType: period.periodType,
        homePoints: period.homePoints,
        awayPoints: period.awayPoints,
        startedAt: null,
        endedAt: null,
      })),
    });
  }

  private async findScoresheetTargetOrThrow(
    client: MatchClient,
    organizationId: number,
    id: number,
  ): Promise<MatchScoresheetTarget> {
    const match = await client.match.findFirst({
      where: {
        id,
        organizationId,
        isDeleted: false,
        tournament: { organizationId, isDeleted: false },
      },
      select: matchScoresheetTargetSelect,
    });
    if (!match) throw ApiException.notFound('Match not found');
    return match;
  }

  private assertScoresheetTournamentMutable(status: TournamentStatus): void {
    if (status === TournamentStatus.CANCELLED) {
      throw ApiException.conflict(
        'Match scoresheets cannot be changed for a cancelled tournament.',
        'TOURNAMENT_NOT_MUTABLE',
      );
    }
  }

  private assertDraftAllowed(status: MatchStatus): void {
    if (status !== MatchStatus.SCHEDULED && status !== MatchStatus.LIVE) {
      throw ApiException.conflict(
        'Drafts can only be saved for scheduled or live matches.',
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertResultAllowed(status: MatchStatus): void {
    if (status !== MatchStatus.SCHEDULED && status !== MatchStatus.LIVE) {
      throw ApiException.conflict(
        'Results can only be submitted for scheduled or live matches.',
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertReopenAllowed(status: MatchStatus): void {
    if (status !== MatchStatus.FINISHED) {
      throw ApiException.conflict(
        'Only a finished match can be reopened.',
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertPlayedResultPayload(
    dto: SubmitMatchResultDto,
    resultType: PlayedResultType,
  ): asserts dto is SubmitMatchResultDto & {
    periods: MatchPeriodInputDto[];
    playerStats: MatchPlayerStatisticInputDto[];
  } {
    if (
      dto.periods === undefined ||
      dto.playerStats === undefined ||
      (resultType === LossType.NORMAL &&
        dto.offendingTournamentTeamId !== undefined) ||
      (resultType === LossType.DEFAULT &&
        dto.offendingTournamentTeamId === undefined)
    ) {
      throw this.invalidResultPayload();
    }
  }

  private assertForfeitResultPayload(
    dto: SubmitMatchResultDto,
  ): asserts dto is SubmitMatchResultDto & {
    offendingTournamentTeamId: number;
  } {
    if (
      dto.offendingTournamentTeamId === undefined ||
      dto.periods !== undefined ||
      dto.playerStats !== undefined ||
      dto.mvpTournamentRosterId !== undefined
    ) {
      throw this.invalidResultPayload();
    }
  }

  private invalidResultPayload(): ApiException {
    return ApiException.badRequest(
      'Invalid data in request.',
      'VALIDATION_ERROR',
    );
  }

  private assertPlayedResultPeriods(
    periods: MatchPeriodInputDto[],
    resultType: PlayedResultType,
  ): void {
    const { homePoints, awayPoints } = this.sumPeriods(periods);
    if (
      resultType === LossType.NORMAL &&
      (periods.length < 4 || homePoints === awayPoints)
    ) {
      throw ApiException.unprocessable(
        'A normal result requires four complete regular periods and a non-tied score.',
        'INVALID_MATCH_PERIODS',
      );
    }
    if (resultType === LossType.DEFAULT && periods.length === 0) {
      throw ApiException.unprocessable(
        'A default result requires at least one period.',
        'INVALID_MATCH_PERIODS',
      );
    }
  }

  private findNonOffendingTournamentTeamId(
    match: MatchScoresheetTarget,
    offendingTournamentTeamId: number | undefined,
  ): number {
    const offender = match.teams.find(
      (team) => team.tournamentTeamId === offendingTournamentTeamId,
    );
    const nonOffender = match.teams.find(
      (team) => team.tournamentTeamId !== offendingTournamentTeamId,
    );
    if (!offender || !nonOffender || match.teams.length !== 2) {
      throw ApiException.unprocessable(
        'The offending team must be one of the match participants.',
        'INVALID_OFFENDING_TEAM',
      );
    }
    return nonOffender.tournamentTeamId;
  }

  private assertPeriodStructure(periods?: MatchPeriodInputDto[]): void {
    if (!periods || periods.length === 0) return;
    const ordered = [...periods].sort(
      (left, right) => left.periodNumber - right.periodNumber,
    );
    const invalid = ordered.some((period, index) => {
      const expectedNumber = index + 1;
      const expectedType =
        expectedNumber <= 4 ? PeriodType.REGULAR : PeriodType.OVERTIME;
      return (
        period.periodNumber !== expectedNumber ||
        period.periodType !== expectedType
      );
    });
    if (invalid) {
      throw ApiException.unprocessable(
        'Periods must be contiguous and use the type required by their number.',
        'INVALID_MATCH_PERIODS',
      );
    }
  }

  private normalizePlayerStatistics(
    input: MatchPlayerStatisticInputDto[],
  ): NormalizedPlayerStatistic[] {
    const rosterIds = new Set<number>();
    const normalized = input.map((stat) => {
      if (rosterIds.has(stat.tournamentRosterId)) {
        throw ApiException.unprocessable(
          'Each player can appear only once in match statistics.',
          'INVALID_PLAYER_STATS',
        );
      }
      rosterIds.add(stat.tournamentRosterId);
      return {
        tournamentRosterId: stat.tournamentRosterId,
        ...Object.fromEntries(
          playerStatisticMetricKeys.map((key) => [key, stat[key] ?? null]),
        ),
      } as NormalizedPlayerStatistic;
    });

    for (const key of playerStatisticMetricKeys) {
      const tracked = normalized.filter((stat) => stat[key] !== null).length;
      if (tracked !== 0 && tracked !== normalized.length) {
        throw ApiException.unprocessable(
          'Each tracked statistic must be provided for every player or be null for every player.',
          'INVALID_PLAYER_STATS',
        );
      }
    }
    for (const stat of normalized) {
      if (
        (stat.fgm !== null && stat.fga !== null && stat.fgm > stat.fga) ||
        (stat.threeFgm !== null &&
          stat.threeFga !== null &&
          stat.threeFgm > stat.threeFga) ||
        (stat.ftm !== null && stat.fta !== null && stat.ftm > stat.fta)
      ) {
        throw ApiException.unprocessable(
          'Made shots cannot exceed attempted shots.',
          'INVALID_PLAYER_STATS',
        );
      }
    }
    return normalized;
  }

  private async resolvePlayerStatistics(
    tx: MatchClient,
    organizationId: number,
    match: MatchScoresheetTarget,
    stats: NormalizedPlayerStatistic[],
  ): Promise<ResolvedPlayerStatistic[]> {
    if (stats.length === 0) return [];
    const ids = stats.map((stat) => stat.tournamentRosterId);
    const rosters = await tx.tournamentRoster.findMany({
      where: { id: { in: ids }, organizationId, isDeleted: false },
      select: tournamentRosterForMatchSelect,
    });
    if (rosters.length !== ids.length) {
      throw ApiException.notFound('Tournament roster not found');
    }
    const rosterById = new Map(rosters.map((roster) => [roster.id, roster]));
    const matchTeamByTournamentTeamId = new Map(
      match.teams.map((team) => [team.tournamentTeamId, team.id]),
    );
    const users = new Set<number>();
    return stats.map((stat) => {
      const roster = rosterById.get(stat.tournamentRosterId);
      if (!roster) throw ApiException.notFound('Tournament roster not found');
      const matchTeamId = matchTeamByTournamentTeamId.get(
        roster.tournamentTeamId,
      );
      if (
        roster.tournamentId !== match.tournamentId ||
        roster.role !== RosterRole.ATHLETE ||
        matchTeamId === undefined
      ) {
        throw ApiException.unprocessable(
          'Every player statistic must reference an athlete from one of the match teams.',
          'INVALID_MATCH_ROSTER',
        );
      }
      if (users.has(roster.userId)) {
        throw ApiException.unprocessable(
          'Each player can appear only once in match statistics.',
          'INVALID_PLAYER_STATS',
        );
      }
      users.add(roster.userId);
      return { ...stat, tournamentRoster: roster, matchTeamId };
    });
  }

  private resolveResultingMvpTournamentRosterId(
    match: MatchScoresheetTarget,
    requestedMvpTournamentRosterId: number | null | undefined,
    replacementStats: NormalizedPlayerStatistic[] | undefined,
  ): number | null {
    const currentMvpTournamentRosterId =
      match.mvpMatchRoster && !match.mvpMatchRoster.isDeleted
        ? match.mvpMatchRoster.tournamentRosterId
        : null;
    const resultingMvpTournamentRosterId =
      requestedMvpTournamentRosterId === undefined
        ? currentMvpTournamentRosterId
        : requestedMvpTournamentRosterId;
    if (resultingMvpTournamentRosterId === null) return null;
    const resultingPlayerTournamentRosterIds = new Set(
      (replacementStats ?? match.playerStatistics).map(
        (stat: { tournamentRosterId: number }) => stat.tournamentRosterId,
      ),
    );
    if (
      !resultingPlayerTournamentRosterIds.has(resultingMvpTournamentRosterId)
    ) {
      this.invalidMvp();
    }
    return resultingMvpTournamentRosterId;
  }

  private findExistingMvpMatchRosterId(
    match: MatchScoresheetTarget,
    resultingMvpTournamentRosterId: number | null,
  ): number | null {
    if (resultingMvpTournamentRosterId === null) return null;
    const statistic = match.playerStatistics.find(
      (candidate) =>
        candidate.tournamentRosterId === resultingMvpTournamentRosterId &&
        candidate.matchRoster !== null &&
        !candidate.matchRoster.isDeleted &&
        candidate.matchRoster.status === MatchRosterStatus.AVAILABLE,
    );
    if (
      statistic?.matchRosterId === null ||
      statistic?.matchRosterId === undefined
    ) {
      return this.invalidMvp();
    }
    return statistic.matchRosterId;
  }

  private invalidMvp(): never {
    throw ApiException.unprocessable(
      'The match MVP must be present in the resulting player statistics.',
      'INVALID_MATCH_MVP',
    );
  }

  private async replacePlayerStatistics(
    tx: MatchClient,
    organizationId: number,
    match: MatchScoresheetTarget,
    stats: ResolvedPlayerStatistic[],
  ): Promise<Map<number, number>> {
    if (match.mvpMatchRosterId !== null) {
      await tx.match.update({
        where: { id: match.id },
        data: { mvpMatchRosterId: null },
      });
    }
    await tx.playerMatchStatistic.updateMany({
      where: { matchId: match.id, organizationId, isDeleted: false },
      data: { isDeleted: true },
    });
    const backingRosterIds = [
      ...new Set(
        match.playerStatistics
          .map((stat) => stat.matchRosterId)
          .filter((id): id is number => id !== null),
      ),
    ];
    if (backingRosterIds.length > 0) {
      await tx.matchRoster.updateMany({
        where: {
          id: { in: backingRosterIds },
          matchId: match.id,
          organizationId,
          status: MatchRosterStatus.AVAILABLE,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
    }

    const createdRosterIds = new Map<number, number>();
    for (const stat of stats) {
      const { tournamentRoster, matchTeamId, tournamentRosterId, ...metrics } =
        stat;
      const matchRoster = await tx.matchRoster.create({
        data: {
          organizationId,
          matchId: match.id,
          matchTeamId,
          tournamentRosterId,
          userId: tournamentRoster.userId,
          role: tournamentRoster.role,
          jerseyNumberSnapshot: tournamentRoster.jerseyNumberSnapshot,
          displayNameSnapshot: tournamentRoster.displayNameSnapshot,
          status: MatchRosterStatus.AVAILABLE,
        },
        select: { id: true },
      });
      createdRosterIds.set(tournamentRosterId, matchRoster.id);
      await tx.playerMatchStatistic.create({
        data: {
          organizationId,
          matchId: match.id,
          matchTeamId,
          matchRosterId: matchRoster.id,
          tournamentRosterId,
          userId: tournamentRoster.userId,
          ...metrics,
        },
      });
    }
    return createdRosterIds;
  }

  private sumPeriods(periods: MatchPeriodInputDto[]): {
    homePoints: number;
    awayPoints: number;
  } {
    return periods.reduce(
      (total, period) => ({
        homePoints: total.homePoints + period.homePoints,
        awayPoints: total.awayPoints + period.awayPoints,
      }),
      { homePoints: 0, awayPoints: 0 },
    );
  }

  private derivePlayedResult(
    match: MatchScoresheetTarget,
    periods: MatchPeriodInputDto[],
    resultType: PlayedResultType,
    nonOffendingTournamentTeamId: number | undefined,
  ): DerivedMatchResult {
    const court = this.sumPeriods(periods);
    const home = this.findMatchSide(match, MatchSide.HOME);
    const away = this.findMatchSide(match, MatchSide.AWAY);

    if (resultType === LossType.NORMAL) {
      const winnerTournamentTeamId =
        court.homePoints > court.awayPoints
          ? home.tournamentTeamId
          : away.tournamentTeamId;
      return this.buildDerivedResult(
        home,
        away,
        court.homePoints,
        court.awayPoints,
        winnerTournamentTeamId,
        LossType.NORMAL,
        'PERIODS',
      );
    }

    if (nonOffendingTournamentTeamId === undefined) {
      throw new Error('DEFAULT offender validation invariant violated');
    }
    const winnerTournamentTeamId = nonOffendingTournamentTeamId;
    const nonOffenderIsAhead =
      winnerTournamentTeamId === home.tournamentTeamId
        ? court.homePoints > court.awayPoints
        : court.awayPoints > court.homePoints;
    const homeScore = nonOffenderIsAhead
      ? court.homePoints
      : winnerTournamentTeamId === home.tournamentTeamId
        ? 2
        : 0;
    const awayScore = nonOffenderIsAhead
      ? court.awayPoints
      : winnerTournamentTeamId === away.tournamentTeamId
        ? 2
        : 0;

    return this.buildDerivedResult(
      home,
      away,
      homeScore,
      awayScore,
      winnerTournamentTeamId,
      LossType.DEFAULT,
      nonOffenderIsAhead ? 'PERIODS' : 'AWARDED',
    );
  }

  private findMatchSide(
    match: MatchScoresheetTarget,
    side: MatchSide,
  ): MatchScoresheetTarget['teams'][number] {
    const team = match.teams.find((candidate) => candidate.side === side);
    if (!team) throw new Error(`Active ${side} MatchTeam invariant violated`);
    return team;
  }

  private buildDerivedResult(
    home: MatchScoresheetTarget['teams'][number],
    away: MatchScoresheetTarget['teams'][number],
    homeScore: number,
    awayScore: number,
    winnerTournamentTeamId: number,
    lossType: LossType,
    scoreSource: MatchScoreSource,
  ): DerivedMatchResult {
    const sideResult = (
      team: MatchScoresheetTarget['teams'][number],
      finalScore: number,
    ): DerivedMatchTeamResult => {
      const isWinner = team.tournamentTeamId === winnerTournamentTeamId;
      return {
        matchTeamId: team.id,
        tournamentTeamId: team.tournamentTeamId,
        finalScore,
        result: isWinner ? MatchResult.WIN : MatchResult.LOSS,
        lossType: isWinner ? null : lossType,
        isWinner,
      };
    };
    return {
      home: sideResult(home, homeScore),
      away: sideResult(away, awayScore),
      winnerTournamentTeamId,
      scoreSource,
    };
  }

  private async writeOfficialResult(
    tx: MatchClient,
    result: DerivedMatchResult,
  ): Promise<void> {
    for (const team of [result.home, result.away]) {
      await tx.matchTeam.update({
        where: { id: team.matchTeamId },
        data: {
          finalScore: team.finalScore,
          result: team.result,
          lossType: team.lossType,
          isWinner: team.isWinner,
        },
      });
    }
  }

  private async synchronizeLinkedSlotWinner(
    tx: MatchClient,
    match: MatchScoresheetTarget,
    slot: MatchScoresheetTarget['bracketSlots'][number] | undefined,
    winnerTournamentTeamId: number,
  ): Promise<void> {
    if (!slot || slot.winnerTournamentTeamId === winnerTournamentTeamId) {
      return;
    }
    await tx.tournamentBracketSlot.update({
      where: { id: slot.id },
      data: { winnerTournamentTeamId },
    });
    if (match.tournament.status === TournamentStatus.COMPLETED) {
      await tx.tournament.update({
        where: { id: match.tournamentId },
        data: {
          status: TournamentStatus.IN_PROGRESS,
          championTournamentTeamId: null,
        },
      });
    }
  }

  private sumPlayerPoints(
    stats: ResolvedPlayerStatistic[],
    result: DerivedMatchResult,
  ): Record<MatchSide, number> | null {
    if (stats.length === 0 || stats.some((stat) => stat.pts === null)) {
      return null;
    }
    return {
      [MatchSide.HOME]: stats
        .filter((stat) => stat.matchTeamId === result.home.matchTeamId)
        .reduce((sum, stat) => sum + (stat.pts ?? 0), 0),
      [MatchSide.AWAY]: stats
        .filter((stat) => stat.matchTeamId === result.away.matchTeamId)
        .reduce((sum, stat) => sum + (stat.pts ?? 0), 0),
    };
  }

  private warnPointsMismatch(
    matchId: number,
    summary: ResultCommitSummary,
  ): void {
    if (
      summary.result.scoreSource !== 'PERIODS' ||
      summary.playerPoints === null
    ) {
      return;
    }
    const sides = [
      { side: MatchSide.HOME, result: summary.result.home },
      { side: MatchSide.AWAY, result: summary.result.away },
    ];
    for (const entry of sides) {
      const playerPoints = summary.playerPoints[entry.side];
      if (playerPoints === entry.result.finalScore) continue;
      this.logger.warn({
        event: 'match_player_points_mismatch',
        matchId,
        side: entry.side,
        playerPoints,
        officialScore: entry.result.finalScore,
      });
    }
  }

  async update(
    organizationId: number,
    id: number,
    dto: UpdateMatchDto,
  ): Promise<MatchDetailResponseDto> {
    // NOTE: declared-but-unsent DTO fields materialize as own properties under
    // this tsconfig, so key presence cannot stand in for "the client sent it".
    const isEmptyPatch = Object.values(dto).every(
      (value) => value === undefined,
    );
    if (isEmptyPatch) return this.findOne(organizationId, id);
    await this.runSerializable((tx) =>
      this.updateTransaction(tx, organizationId, id, dto),
    );
    return this.findOne(organizationId, id);
  }

  private async updateTransaction(
    tx: MatchClient,
    organizationId: number,
    id: number,
    dto: UpdateMatchDto,
  ): Promise<void> {
    const current = await this.findUpdateTargetOrThrow(tx, organizationId, id);
    this.assertPatchAllowed(current.status, dto);
    const home = current.teams.find((team) => team.side === MatchSide.HOME);
    const away = current.teams.find((team) => team.side === MatchSide.AWAY);
    if (!home || !away) {
      throw new Error('Active HOME/AWAY MatchTeam invariant violated');
    }
    const homeId = dto.homeTournamentTeamId ?? home.tournamentTeamId;
    const awayId = dto.awayTournamentTeamId ?? away.tournamentTeamId;
    const groupId =
      dto.tournamentGroupId !== undefined
        ? dto.tournamentGroupId
        : current.tournamentGroupId;
    const changesParticipants =
      (dto.homeTournamentTeamId !== undefined &&
        homeId !== home.tournamentTeamId) ||
      (dto.awayTournamentTeamId !== undefined &&
        awayId !== away.tournamentTeamId);

    if (this.changesStructure(dto)) {
      await this.validateGroup(
        tx,
        organizationId,
        current.tournamentId,
        current.tournament.format,
        groupId,
      );
      await this.validateParticipant(
        tx,
        organizationId,
        current.tournamentId,
        homeId,
      );
      await this.validateParticipant(
        tx,
        organizationId,
        current.tournamentId,
        awayId,
      );
      this.assertDistinctParticipants(homeId, awayId);
      await this.assertGroupMemberships(
        tx,
        organizationId,
        current.tournamentId,
        groupId,
        homeId,
        awayId,
      );
      this.assertBracketConsistency(
        current.bracketSlots[0],
        groupId,
        homeId,
        awayId,
      );
    }
    if (changesParticipants && current.status === MatchStatus.POSTPONED) {
      await this.assertNoScoresheet(tx, organizationId, id);
    }

    const data: Prisma.MatchUncheckedUpdateInput = {};
    if (dto.tournamentGroupId !== undefined) data.tournamentGroupId = groupId;
    if (dto.matchNumber !== undefined) data.matchNumber = dto.matchNumber;
    if (dto.scheduledAt !== undefined) {
      data.scheduledAt = new Date(dto.scheduledAt);
      if (current.status === MatchStatus.POSTPONED) {
        data.status = MatchStatus.SCHEDULED;
      }
    }
    if (dto.venueName !== undefined) data.venueName = dto.venueName;
    if (Object.keys(data).length > 0) {
      await tx.match.update({ where: { id }, data });
    }

    if (!changesParticipants) return;
    // NOTE: both rows leave the active partial unique indexes on
    // match_teams(match_id, side) and match_teams(match_id, tournament_team_id)
    // before either id is rewritten, so a straight side swap cannot collide
    // mid-transaction. Do not collapse this into two plain updates.
    const sideIds = [home.id, away.id];
    await tx.matchTeam.updateMany({
      where: {
        id: { in: sideIds },
        matchId: id,
        organizationId,
        isDeleted: false,
      },
      data: { isDeleted: true },
    });
    await tx.matchTeam.update({
      where: { id: home.id },
      data: { tournamentTeamId: homeId },
    });
    await tx.matchTeam.update({
      where: { id: away.id },
      data: { tournamentTeamId: awayId },
    });
    await tx.matchTeam.updateMany({
      where: {
        id: { in: sideIds },
        matchId: id,
        organizationId,
        isDeleted: true,
      },
      data: { isDeleted: false },
    });
  }

  private async findUpdateTargetOrThrow(
    client: MatchClient,
    organizationId: number,
    id: number,
  ): Promise<MatchUpdateTarget> {
    const match = await client.match.findFirst({
      where: {
        id,
        organizationId,
        isDeleted: false,
        tournament: { organizationId, isDeleted: false },
      },
      select: matchUpdateTargetSelect,
    });
    if (!match) throw ApiException.notFound('Match not found');
    return match;
  }

  private changesStructure(dto: UpdateMatchDto): boolean {
    return (
      dto.homeTournamentTeamId !== undefined ||
      dto.awayTournamentTeamId !== undefined ||
      dto.tournamentGroupId !== undefined
    );
  }

  private assertPatchAllowed(status: MatchStatus, dto: UpdateMatchDto): void {
    if (
      dto.scheduledAt !== undefined &&
      (status === MatchStatus.FINISHED || status === MatchStatus.CANCELLED)
    ) {
      throw ApiException.conflict(
        'scheduledAt cannot be changed for a finished or cancelled match.',
        'INVALID_STATUS_TRANSITION',
      );
    }
    if (
      this.changesStructure(dto) &&
      status !== MatchStatus.SCHEDULED &&
      status !== MatchStatus.POSTPONED
    ) {
      throw ApiException.conflict(
        'Participants and tournamentGroupId can only be changed for scheduled or postponed matches.',
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertBracketConsistency(
    slot: MatchUpdateTarget['bracketSlots'][number] | undefined,
    tournamentGroupId: number | null,
    homeId: number,
    awayId: number,
  ): void {
    if (!slot) return;
    if (tournamentGroupId !== null) {
      throw ApiException.unprocessable(
        'A match linked to a bracket slot cannot belong to a tournament group.',
        'MATCH_IN_BRACKET',
      );
    }
    if (
      slot.homeTournamentTeamId === null ||
      slot.awayTournamentTeamId === null
    ) {
      return;
    }
    const slotIds = [slot.homeTournamentTeamId, slot.awayTournamentTeamId].sort(
      (left, right) => left - right,
    );
    const matchIds = [homeId, awayId].sort((left, right) => left - right);
    if (slotIds[0] !== matchIds[0] || slotIds[1] !== matchIds[1]) {
      throw this.matchTeamsMismatch();
    }
  }

  private assertLinkedSlotMatchesParticipants(
    match: MatchScoresheetTarget,
  ): MatchScoresheetTarget['bracketSlots'][number] | undefined {
    const slot = match.bracketSlots[0];
    if (!slot) return undefined;
    if (
      slot.homeTournamentTeamId === null ||
      slot.awayTournamentTeamId === null
    ) {
      throw this.matchTeamsMismatch();
    }
    const slotIds = [slot.homeTournamentTeamId, slot.awayTournamentTeamId].sort(
      (left, right) => left - right,
    );
    const matchIds = match.teams
      .map((team) => team.tournamentTeamId)
      .sort((left, right) => left - right);
    if (
      matchIds.length !== 2 ||
      slotIds[0] !== matchIds[0] ||
      slotIds[1] !== matchIds[1]
    ) {
      throw this.matchTeamsMismatch();
    }
    return slot;
  }

  private matchTeamsMismatch(): ApiException {
    return ApiException.unprocessable(
      'The match participants do not match the bracket slot participants.',
      'MATCH_TEAMS_MISMATCH',
    );
  }

  private async assertNoScoresheet(
    client: MatchClient,
    organizationId: number,
    matchId: number,
  ): Promise<void> {
    const where = { matchId, organizationId, isDeleted: false };
    const period = await client.matchPeriod.findFirst({
      where,
      select: { id: true },
    });
    const roster = await client.matchRoster.findFirst({
      where,
      select: { id: true },
    });
    const statistic = await client.playerMatchStatistic.findFirst({
      where,
      select: { id: true },
    });
    if (period || roster || statistic) {
      throw ApiException.conflict(
        'Match participants cannot be changed after scoresheet data has been recorded.',
        'MATCH_HAS_SCORESHEET',
      );
    }
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isPrismaError(error, 'P2034')) throw error;
        if (attempt === 3) throw this.concurrentModification();
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

  postpone(
    organizationId: number,
    id: number,
  ): Promise<MatchDetailResponseDto> {
    return this.transitionStatus(
      organizationId,
      id,
      [MatchStatus.SCHEDULED, MatchStatus.LIVE],
      MatchStatus.POSTPONED,
      'Only a scheduled or live match can be postponed.',
    );
  }

  cancel(organizationId: number, id: number): Promise<MatchDetailResponseDto> {
    return this.transitionStatus(
      organizationId,
      id,
      [MatchStatus.SCHEDULED, MatchStatus.LIVE, MatchStatus.POSTPONED],
      MatchStatus.CANCELLED,
      'Only a scheduled, live, or postponed match can be cancelled.',
    );
  }

  private async transitionStatus(
    organizationId: number,
    id: number,
    allowed: MatchStatus[],
    next: MatchStatus,
    message: string,
  ): Promise<MatchDetailResponseDto> {
    const current = await this.findUpdateTargetOrThrow(
      this.prisma,
      organizationId,
      id,
    );
    if (!allowed.includes(current.status)) {
      throw ApiException.conflict(message, 'INVALID_STATUS_TRANSITION');
    }
    const result = await this.prisma.match.updateMany({
      where: {
        id,
        organizationId,
        isDeleted: false,
        status: { in: allowed },
      },
      data: { status: next },
    });
    if (result.count === 0) {
      const fresh = await this.findUpdateTargetOrThrow(
        this.prisma,
        organizationId,
        id,
      );
      if (!allowed.includes(fresh.status)) {
        throw ApiException.conflict(message, 'INVALID_STATUS_TRANSITION');
      }
      throw this.concurrentModification();
    }
    return this.findOne(organizationId, id);
  }
}
