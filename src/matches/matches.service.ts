import { Injectable } from '@nestjs/common';
import {
  LossType,
  MatchSide,
  MatchStatus,
  Prisma,
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

type MatchSummaryRow = Prisma.MatchGetPayload<{
  select: typeof matchSummarySelect;
}>;
type MatchDetailRow = Prisma.MatchGetPayload<{
  select: typeof matchDetailSelect;
}>;
type MatchUpdateTarget = Prisma.MatchGetPayload<{
  select: typeof matchUpdateTargetSelect;
}>;
type MatchClient = Pick<
  Prisma.TransactionClient,
  | 'match'
  | 'matchTeam'
  | 'tournament'
  | 'tournamentGroup'
  | 'tournamentTeam'
  | 'tournamentGroupTeam'
  | 'tournamentBracketSlot'
  | 'matchPeriod'
  | 'matchRoster'
  | 'playerMatchStatistic'
>;

@Injectable()
export class MatchesService {
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
    const isForfeit = row.teams.some(
      (team) => team.lossType === LossType.FORFEIT,
    );
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

  async update(
    organizationId: number,
    id: number,
    dto: UpdateMatchDto,
  ): Promise<MatchDetailResponseDto> {
    if (Object.keys(dto).length === 0) return this.findOne(organizationId, id);
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
      ('homeTournamentTeamId' in dto && homeId !== home.tournamentTeamId) ||
      ('awayTournamentTeamId' in dto && awayId !== away.tournamentTeamId);
    const changesStructure =
      'homeTournamentTeamId' in dto ||
      'awayTournamentTeamId' in dto ||
      'tournamentGroupId' in dto;

    if (changesStructure) {
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
    if ('tournamentGroupId' in dto) data.tournamentGroupId = groupId;
    if ('matchNumber' in dto) data.matchNumber = dto.matchNumber;
    if ('scheduledAt' in dto) {
      data.scheduledAt = new Date(dto.scheduledAt as string);
      if (current.status === MatchStatus.POSTPONED) {
        data.status = MatchStatus.SCHEDULED;
      }
    }
    if ('venueName' in dto) data.venueName = dto.venueName;
    if (Object.keys(data).length > 0) {
      await tx.match.update({ where: { id }, data });
    }

    if (!changesParticipants) return;
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

  private assertPatchAllowed(status: MatchStatus, dto: UpdateMatchDto): void {
    if (
      'scheduledAt' in dto &&
      (status === MatchStatus.FINISHED || status === MatchStatus.CANCELLED)
    ) {
      throw ApiException.conflict(
        'scheduledAt cannot be changed for a finished or cancelled match.',
        'INVALID_STATUS_TRANSITION',
      );
    }
    const changesStructure =
      'homeTournamentTeamId' in dto ||
      'awayTournamentTeamId' in dto ||
      'tournamentGroupId' in dto;
    if (
      changesStructure &&
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
      throw ApiException.unprocessable(
        'The match participants do not match the bracket slot participants.',
        'MATCH_TEAMS_MISMATCH',
      );
    }
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
}
