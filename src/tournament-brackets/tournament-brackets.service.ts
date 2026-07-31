import { Injectable } from '@nestjs/common';
import {
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
  BracketResponseDto,
  BracketRoundResponseDto,
  BracketSlotMatchResponseDto,
  BracketSlotTeamResponseDto,
} from './dto/bracket-response.dto';
import { CreateTournamentBracketRoundDto } from './dto/create-tournament-bracket-round.dto';
import { CreateTournamentBracketSlotDto } from './dto/create-tournament-bracket-slot.dto';
import { LinkBracketSlotMatchDto } from './dto/link-bracket-slot-match.dto';
import { SetBracketSlotWinnerDto } from './dto/set-bracket-slot-winner.dto';
import { TournamentBracketRoundResponseDto } from './dto/tournament-bracket-round-response.dto';
import { TournamentBracketSlotResponseDto } from './dto/tournament-bracket-slot-response.dto';
import { UpdateTournamentBracketRoundDto } from './dto/update-tournament-bracket-round.dto';
import { UpdateTournamentBracketSlotDto } from './dto/update-tournament-bracket-slot.dto';

const bracketSlotTeamSelect = {
  id: true,
  displayNameSnapshot: true,
  team: { select: { shortName: true } },
} satisfies Prisma.TournamentTeamSelect;

export const bracketReadSelect = {
  id: true,
  number: true,
  label: true,
  slots: {
    where: { isDeleted: false },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      position: true,
      label: true,
      winnerTournamentTeamId: true,
      // NOTE: isDeleted is selected because Prisma cannot filter a to-one
      // relation; a soft-deleted match is discarded in toSlotMatch instead.
      match: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          isDeleted: true,
          teams: {
            where: { isDeleted: false },
            select: { side: true, finalScore: true },
          },
        },
      },
      homeTournamentTeam: { select: bracketSlotTeamSelect },
      awayTournamentTeam: { select: bracketSlotTeamSelect },
    },
  },
} satisfies Prisma.TournamentBracketRoundSelect;

type BracketRoundReadRow = Prisma.TournamentBracketRoundGetPayload<{
  select: typeof bracketReadSelect;
}>;

type BracketSlotTeamRow =
  BracketRoundReadRow['slots'][number]['homeTournamentTeam'];

type BracketSlotMatchRow = BracketRoundReadRow['slots'][number]['match'];

export const tournamentBracketRoundSelect = {
  id: true,
  tournamentId: true,
  number: true,
  label: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentBracketRoundSelect;

export const tournamentBracketRoundTargetSelect = {
  ...tournamentBracketRoundSelect,
  tournament: { select: { status: true, format: true } },
} satisfies Prisma.TournamentBracketRoundSelect;

type TournamentBracketRoundTarget = Prisma.TournamentBracketRoundGetPayload<{
  select: typeof tournamentBracketRoundTargetSelect;
}>;

export const tournamentBracketSlotSelect = {
  id: true,
  tournamentId: true,
  roundId: true,
  position: true,
  label: true,
  homeTournamentTeamId: true,
  awayTournamentTeamId: true,
  matchId: true,
  winnerTournamentTeamId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentBracketSlotSelect;

export const tournamentBracketSlotTargetSelect = {
  ...tournamentBracketSlotSelect,
  tournament: { select: { status: true, format: true } },
} satisfies Prisma.TournamentBracketSlotSelect;

export const matchLinkTargetSelect = {
  id: true,
  tournamentId: true,
  tournamentGroupId: true,
  status: true,
  teams: {
    where: { isDeleted: false },
    select: { tournamentTeamId: true },
  },
} satisfies Prisma.MatchSelect;

type MatchLinkTarget = Prisma.MatchGetPayload<{
  select: typeof matchLinkTargetSelect;
}>;

type TournamentBracketSlotTarget = Prisma.TournamentBracketSlotGetPayload<{
  select: typeof tournamentBracketSlotTargetSelect;
}>;

type BracketTransactionClient = Pick<
  Prisma.TransactionClient,
  'match' | 'tournament' | 'tournamentBracketSlot' | 'tournamentTeam'
>;

@Injectable()
export class TournamentBracketsService {
  constructor(private readonly prisma: PrismaService) {}

  async findBracket(
    organizationId: number,
    tournamentId: number,
  ): Promise<BracketResponseDto> {
    await this.findTournamentOrThrow(organizationId, tournamentId);
    const rounds = await this.prisma.tournamentBracketRound.findMany({
      where: { tournamentId, organizationId, isDeleted: false },
      orderBy: [{ number: 'asc' }, { id: 'asc' }],
      select: bracketReadSelect,
    });
    return { rounds: rounds.map((round) => this.toBracketRound(round)) };
  }

  async createRound(
    organizationId: number,
    tournamentId: number,
    dto: CreateTournamentBracketRoundDto,
  ): Promise<TournamentBracketRoundResponseDto> {
    const tournament = await this.findTournamentOrThrow(
      organizationId,
      tournamentId,
    );
    this.assertMutable(tournament.status);
    this.assertKnockoutFormat(tournament.format);
    await this.assertRoundNumberAvailable(
      organizationId,
      tournamentId,
      dto.number,
    );

    return this.prisma.tournamentBracketRound.create({
      data: {
        organizationId,
        tournamentId,
        number: dto.number,
        label: dto.label ?? null,
      },
      select: tournamentBracketRoundSelect,
    });
  }

  async updateRound(
    organizationId: number,
    id: number,
    dto: UpdateTournamentBracketRoundDto,
  ): Promise<TournamentBracketRoundResponseDto> {
    const round = await this.findRoundOrThrow(organizationId, id);
    this.assertMutable(round.tournament.status);
    this.assertKnockoutFormat(round.tournament.format);

    const { tournament, ...current } = round;
    void tournament;

    const data: Prisma.TournamentBracketRoundUncheckedUpdateInput = {};
    if (dto.number !== undefined) data.number = dto.number;
    if (dto.label !== undefined) data.label = dto.label;
    if (Object.keys(data).length === 0) return current;

    if (dto.number !== undefined) {
      await this.assertRoundNumberAvailable(
        organizationId,
        current.tournamentId,
        dto.number,
        id,
      );
    }

    return this.prisma.tournamentBracketRound.update({
      where: { id },
      data,
      select: tournamentBracketRoundSelect,
    });
  }

  async removeRound(organizationId: number, id: number): Promise<void> {
    const round = await this.findRoundOrThrow(organizationId, id);
    this.assertMutable(round.tournament.status);
    this.assertKnockoutFormat(round.tournament.format);

    const slot = await this.prisma.tournamentBracketSlot.findFirst({
      where: { roundId: id, organizationId, isDeleted: false },
      select: { id: true },
    });
    if (slot) {
      throw ApiException.conflict(
        'The round must be empty before it can be deleted.',
        'ROUND_NOT_EMPTY',
      );
    }

    await this.prisma.tournamentBracketRound.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async createSlot(
    organizationId: number,
    dto: CreateTournamentBracketSlotDto,
  ): Promise<TournamentBracketSlotResponseDto> {
    const round = await this.findRoundOrThrow(organizationId, dto.roundId);
    this.assertMutable(round.tournament.status);
    this.assertKnockoutFormat(round.tournament.format);
    await this.assertSlotPositionAvailable(
      organizationId,
      round.id,
      dto.position,
    );

    await this.assertParticipant(
      organizationId,
      round.tournamentId,
      dto.homeTournamentTeamId,
    );
    await this.assertParticipant(
      organizationId,
      round.tournamentId,
      dto.awayTournamentTeamId,
    );
    this.assertDistinctParticipants(
      dto.homeTournamentTeamId ?? null,
      dto.awayTournamentTeamId ?? null,
    );

    return this.prisma.tournamentBracketSlot.create({
      data: {
        organizationId,
        tournamentId: round.tournamentId,
        roundId: round.id,
        position: dto.position,
        label: dto.label ?? null,
        homeTournamentTeamId: dto.homeTournamentTeamId ?? null,
        awayTournamentTeamId: dto.awayTournamentTeamId ?? null,
      },
      select: tournamentBracketSlotSelect,
    });
  }

  async updateSlot(
    organizationId: number,
    id: number,
    dto: UpdateTournamentBracketSlotDto,
  ): Promise<TournamentBracketSlotResponseDto> {
    return this.updateSlotAttempt(organizationId, id, dto, true);
  }

  private async updateSlotAttempt(
    organizationId: number,
    id: number,
    dto: UpdateTournamentBracketSlotDto,
    retryOnCasMiss: boolean,
  ): Promise<TournamentBracketSlotResponseDto> {
    const slot = await this.findSlotOrThrow(organizationId, id);
    this.assertMutable(slot.tournament.status);
    this.assertKnockoutFormat(slot.tournament.format);

    const { tournament, ...current } = slot;

    const data: Prisma.TournamentBracketSlotUncheckedUpdateManyInput = {};
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.homeTournamentTeamId !== undefined) {
      data.homeTournamentTeamId = dto.homeTournamentTeamId;
    }
    if (dto.awayTournamentTeamId !== undefined) {
      data.awayTournamentTeamId = dto.awayTournamentTeamId;
    }
    if (Object.keys(data).length === 0) return current;

    if (dto.position !== undefined) {
      await this.assertSlotPositionAvailable(
        organizationId,
        current.roundId,
        dto.position,
        id,
      );
    }

    await this.assertParticipant(
      organizationId,
      current.tournamentId,
      dto.homeTournamentTeamId,
    );
    await this.assertParticipant(
      organizationId,
      current.tournamentId,
      dto.awayTournamentTeamId,
    );
    const mergedHomeTournamentTeamId =
      dto.homeTournamentTeamId !== undefined
        ? dto.homeTournamentTeamId
        : current.homeTournamentTeamId;
    const mergedAwayTournamentTeamId =
      dto.awayTournamentTeamId !== undefined
        ? dto.awayTournamentTeamId
        : current.awayTournamentTeamId;

    this.assertDistinctParticipants(
      mergedHomeTournamentTeamId,
      mergedAwayTournamentTeamId,
    );

    this.assertStoredWinnerStillParticipant(
      current.winnerTournamentTeamId,
      mergedHomeTournamentTeamId,
      mergedAwayTournamentTeamId,
    );

    if (current.matchId !== null) {
      // A soft-deleted match already reads as null in the composite bracket,
      // so there is nothing left for the patch to contradict.
      const match = await this.findLinkedMatch(organizationId, current.matchId);
      if (match) {
        this.assertMatchTeamsMatchSlot(
          mergedHomeTournamentTeamId,
          mergedAwayTournamentTeamId,
          match.teams,
        );
      }
    }

    const result = await this.prisma.tournamentBracketSlot.updateMany({
      where: {
        id,
        organizationId,
        isDeleted: false,
        matchId: current.matchId,
        homeTournamentTeamId: current.homeTournamentTeamId,
        awayTournamentTeamId: current.awayTournamentTeamId,
        winnerTournamentTeamId: current.winnerTournamentTeamId,
        tournament: {
          is: {
            organizationId,
            isDeleted: false,
            status: tournament.status,
            format: tournament.format,
          },
        },
      },
      data,
    });

    if (result.count === 0) {
      if (retryOnCasMiss) {
        return this.updateSlotAttempt(organizationId, id, dto, false);
      }
      throw this.concurrentModification();
    }

    const updated = await this.prisma.tournamentBracketSlot.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: tournamentBracketSlotSelect,
    });
    if (!updated) {
      throw ApiException.notFound('Tournament bracket slot not found');
    }
    return updated;
  }

  async removeSlot(organizationId: number, id: number): Promise<void> {
    const slot = await this.findSlotOrThrow(organizationId, id);
    this.assertMutable(slot.tournament.status);
    this.assertKnockoutFormat(slot.tournament.format);

    // NOTE: the guard exists so the unlink cascade cannot be bypassed by
    // deleting the slot instead of unlinking the match first.
    if (slot.matchId !== null) {
      throw ApiException.conflict(
        'Unlink the match before deleting the slot.',
        'SLOT_HAS_MATCH',
      );
    }

    await this.prisma.tournamentBracketSlot.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async linkMatch(
    organizationId: number,
    id: number,
    dto: LinkBracketSlotMatchDto,
  ): Promise<TournamentBracketSlotResponseDto> {
    try {
      // NOTE: the CAS retry depends on Read Committed — each statement
      // re-snapshots, so the fresh read sees the winning commit. Under
      // Serializable the write would abort with P2034 instead of missing,
      // so that path needs retry-on-P2034, not this fresh-read retry.
      return await this.prisma.$transaction((tx) =>
        this.linkMatchAttempt(tx, organizationId, id, dto.matchId, true),
      );
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw ApiException.conflict(
          'This match is already linked to another bracket slot.',
          'MATCH_ALREADY_LINKED',
        );
      }
      throw error;
    }
  }

  private async linkMatchAttempt(
    tx: BracketTransactionClient,
    organizationId: number,
    id: number,
    matchId: number,
    retryOnCasMiss: boolean,
  ): Promise<TournamentBracketSlotResponseDto> {
    const slot = await this.findSlotOrThrow(organizationId, id, tx);
    this.assertMutable(slot.tournament.status);
    this.assertKnockoutFormat(slot.tournament.format);

    if (slot.matchId !== null) {
      throw ApiException.conflict(
        'Unlink the current match before linking another one.',
        'SLOT_HAS_MATCH',
      );
    }

    const match = await this.findMatchOrThrow(organizationId, matchId, tx);

    if (match.tournamentId !== slot.tournamentId) {
      throw ApiException.unprocessable(
        'The bracket slot and match must belong to the same tournament.',
        'INVALID_BRACKET_ASSIGNMENT',
      );
    }
    // A match belongs to the group stage or to the bracket, never to both.
    if (match.tournamentGroupId !== null) {
      throw ApiException.unprocessable(
        'A group stage match cannot be linked to a bracket slot.',
        'MATCH_IN_GROUP_STAGE',
      );
    }
    if (match.status === MatchStatus.CANCELLED) {
      throw ApiException.unprocessable(
        'A cancelled match cannot be linked to a bracket slot.',
        'MATCH_CANCELLED',
      );
    }

    const linkedElsewhere = await tx.tournamentBracketSlot.findFirst({
      where: { matchId: match.id, organizationId, isDeleted: false },
      select: { id: true },
    });
    if (linkedElsewhere) {
      throw ApiException.conflict(
        'This match is already linked to another bracket slot.',
        'MATCH_ALREADY_LINKED',
      );
    }

    this.assertMatchTeamsMatchSlot(
      slot.homeTournamentTeamId,
      slot.awayTournamentTeamId,
      match.teams,
    );

    const result = await tx.tournamentBracketSlot.updateMany({
      where: {
        id,
        organizationId,
        isDeleted: false,
        matchId: null,
        homeTournamentTeamId: slot.homeTournamentTeamId,
        awayTournamentTeamId: slot.awayTournamentTeamId,
        winnerTournamentTeamId: slot.winnerTournamentTeamId,
        tournament: {
          is: {
            organizationId,
            isDeleted: false,
            status: slot.tournament.status,
            format: slot.tournament.format,
          },
        },
      },
      data: { matchId },
    });

    if (result.count === 0) {
      if (retryOnCasMiss) {
        return this.linkMatchAttempt(tx, organizationId, id, matchId, false);
      }
      throw this.concurrentModification();
    }

    const updated = await tx.tournamentBracketSlot.findFirst({
      where: { id, organizationId, isDeleted: false },
      select: tournamentBracketSlotSelect,
    });
    if (!updated) {
      throw ApiException.notFound('Tournament bracket slot not found');
    }
    return updated;
  }

  async unlinkMatch(organizationId: number, id: number): Promise<void> {
    const slot = await this.findSlotOrThrow(organizationId, id);
    this.assertMutable(slot.tournament.status);
    this.assertKnockoutFormat(slot.tournament.format);

    if (slot.matchId === null) {
      throw ApiException.notFound(
        'This bracket slot has no linked match.',
        'SLOT_HAS_NO_MATCH',
      );
    }

    const match = await this.findLinkedMatch(organizationId, slot.matchId);

    if (match?.status === MatchStatus.FINISHED) {
      throw ApiException.conflict(
        'A finished match cannot be unlinked from its bracket slot.',
        'MATCH_ALREADY_FINISHED',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tournamentBracketSlot.update({
        where: { id },
        data: { matchId: null },
      });

      // A knockout match does not exist without a slot, so a match that is
      // still going to happen is cancelled with the link. CANCELLED is
      // already terminal and a deleted row has nothing left to cascade to.
      if (match && match.status !== MatchStatus.CANCELLED) {
        await tx.match.update({
          where: { id: match.id },
          data: { status: MatchStatus.CANCELLED },
        });
      }
    });
  }

  async setWinner(
    organizationId: number,
    id: number,
    dto: SetBracketSlotWinnerDto,
  ): Promise<TournamentBracketSlotResponseDto> {
    const slot = await this.findSlotOrThrow(organizationId, id);
    this.assertWinnerWritable(slot.tournament.status);
    this.assertKnockoutFormat(slot.tournament.format);

    const { tournament, ...current } = slot;
    const { winnerTournamentTeamId } = dto;

    this.assertStoredWinnerStillParticipant(
      winnerTournamentTeamId,
      current.homeTournamentTeamId,
      current.awayTournamentTeamId,
    );

    // The reopen cascade is conditioned on the winner changing, so an
    // idempotent write must not reopen a completed tournament.
    if (winnerTournamentTeamId === current.winnerTournamentTeamId) {
      return current;
    }

    const shouldReopenTournament =
      tournament.status === TournamentStatus.COMPLETED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tournamentBracketSlot.update({
        where: { id },
        data: { winnerTournamentTeamId },
        select: tournamentBracketSlotSelect,
      });

      // A title does not survive a change to the result that produced it.
      // Both fields are written together: the DB check constraint only
      // tolerates a champion while the tournament is COMPLETED.
      if (shouldReopenTournament) {
        await tx.tournament.update({
          where: { id: current.tournamentId },
          data: {
            status: TournamentStatus.IN_PROGRESS,
            championTournamentTeamId: null,
          },
        });
      }

      return updated;
    });
  }

  private toBracketRound(round: BracketRoundReadRow): BracketRoundResponseDto {
    return {
      id: round.id,
      number: round.number,
      label: round.label,
      slots: round.slots.map((slot) => ({
        id: slot.id,
        position: slot.position,
        label: slot.label,
        homeTeam: this.toSlotTeam(slot.homeTournamentTeam),
        awayTeam: this.toSlotTeam(slot.awayTournamentTeam),
        match: this.toSlotMatch(slot.match),
        winnerTournamentTeamId: slot.winnerTournamentTeamId,
      })),
    };
  }

  private toSlotTeam(
    registration: BracketSlotTeamRow,
  ): BracketSlotTeamResponseDto | null {
    if (!registration) return null;
    return {
      tournamentTeamId: registration.id,
      name: registration.displayNameSnapshot,
      shortName: registration.team.shortName,
    };
  }

  private toSlotMatch(
    match: BracketSlotMatchRow,
  ): BracketSlotMatchResponseDto | null {
    if (!match || match.isDeleted) return null;
    return {
      id: match.id,
      status: match.status,
      date: match.scheduledAt,
      // NOTE: scores are read as persisted. Result derivation is Phase 9.
      homeScore: this.findSideScore(match.teams, MatchSide.HOME),
      awayScore: this.findSideScore(match.teams, MatchSide.AWAY),
    };
  }

  private findSideScore(
    teams: { side: MatchSide; finalScore: number | null }[],
    side: MatchSide,
  ): number | null {
    return teams.find((team) => team.side === side)?.finalScore ?? null;
  }

  private async findTournamentOrThrow(
    organizationId: number,
    tournamentId: number,
  ): Promise<{
    id: number;
    status: TournamentStatus;
    format: TournamentFormat;
  }> {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id: tournamentId, organizationId, isDeleted: false },
      select: { id: true, status: true, format: true },
    });
    if (!tournament) throw ApiException.notFound('Tournament not found');
    return tournament;
  }

  private async findRoundOrThrow(
    organizationId: number,
    id: number,
  ): Promise<TournamentBracketRoundTarget> {
    const round = await this.prisma.tournamentBracketRound.findFirst({
      where: {
        id,
        organizationId,
        isDeleted: false,
        tournament: { organizationId, isDeleted: false },
      },
      select: tournamentBracketRoundTargetSelect,
    });
    if (!round) {
      throw ApiException.notFound('Tournament bracket round not found');
    }
    return round;
  }

  private async assertRoundNumberAvailable(
    organizationId: number,
    tournamentId: number,
    number: number,
    exceptId?: number,
  ): Promise<void> {
    const duplicate = await this.prisma.tournamentBracketRound.findFirst({
      where: {
        tournamentId,
        organizationId,
        number,
        isDeleted: false,
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiException.conflict(
        'A round with this number already exists in the tournament.',
        'DUPLICATE_RECORD',
      );
    }
  }

  private async findSlotOrThrow(
    organizationId: number,
    id: number,
    client: BracketTransactionClient = this.prisma,
  ): Promise<TournamentBracketSlotTarget> {
    const slot = await client.tournamentBracketSlot.findFirst({
      where: {
        id,
        organizationId,
        isDeleted: false,
        tournament: { organizationId, isDeleted: false },
      },
      select: tournamentBracketSlotTargetSelect,
    });
    if (!slot) {
      throw ApiException.notFound('Tournament bracket slot not found');
    }
    return slot;
  }

  private async assertSlotPositionAvailable(
    organizationId: number,
    roundId: number,
    position: number,
    exceptId?: number,
  ): Promise<void> {
    const duplicate = await this.prisma.tournamentBracketSlot.findFirst({
      where: {
        roundId,
        organizationId,
        position,
        isDeleted: false,
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw ApiException.conflict(
        'A slot with this position already exists in the round.',
        'DUPLICATE_RECORD',
      );
    }
  }

  private async assertParticipant(
    organizationId: number,
    tournamentId: number,
    tournamentTeamId: number | null | undefined,
  ): Promise<void> {
    if (tournamentTeamId === undefined || tournamentTeamId === null) return;

    const registration = await this.prisma.tournamentTeam.findFirst({
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
        'The bracket slot and tournament team must belong to the same tournament.',
        'INVALID_BRACKET_ASSIGNMENT',
      );
    }
  }

  private async findLinkedMatch(
    organizationId: number,
    matchId: number,
    client: BracketTransactionClient = this.prisma,
  ): Promise<MatchLinkTarget | null> {
    return client.match.findFirst({
      where: { id: matchId, organizationId, isDeleted: false },
      select: matchLinkTargetSelect,
    });
  }

  private async findMatchOrThrow(
    organizationId: number,
    matchId: number,
    client: BracketTransactionClient = this.prisma,
  ): Promise<MatchLinkTarget> {
    const match = await this.findLinkedMatch(organizationId, matchId, client);
    if (!match) throw ApiException.notFound('Match not found');
    return match;
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

  private assertMatchTeamsMatchSlot(
    homeTournamentTeamId: number | null,
    awayTournamentTeamId: number | null,
    matchTeams: { tournamentTeamId: number }[],
  ): void {
    // A slot with a bye or with undecided participants is a legal manual
    // state, so there is nothing to contradict yet.
    if (homeTournamentTeamId === null || awayTournamentTeamId === null) return;

    // Compared as a set: match HOME/AWAY is home-court logistics, slot
    // home/away is bracket display order. They need not agree.
    const slotParticipants = [homeTournamentTeamId, awayTournamentTeamId].sort(
      (a, b) => a - b,
    );
    const matchParticipants = matchTeams
      .map((team) => team.tournamentTeamId)
      .sort((a, b) => a - b);

    const isSamePairing =
      matchParticipants.length === slotParticipants.length &&
      matchParticipants.every((id, index) => id === slotParticipants[index]);

    if (!isSamePairing) {
      throw ApiException.unprocessable(
        'The match participants do not match the bracket slot participants.',
        'MATCH_TEAMS_MISMATCH',
      );
    }
  }

  private assertDistinctParticipants(
    homeTournamentTeamId: number | null,
    awayTournamentTeamId: number | null,
  ): void {
    if (
      homeTournamentTeamId !== null &&
      homeTournamentTeamId === awayTournamentTeamId
    ) {
      throw ApiException.unprocessable(
        'A slot cannot have the same team on both sides.',
        'SAME_TEAM_IN_SLOT',
      );
    }
  }

  private assertStoredWinnerStillParticipant(
    winnerTournamentTeamId: number | null,
    homeTournamentTeamId: number | null,
    awayTournamentTeamId: number | null,
  ): void {
    if (
      winnerTournamentTeamId !== null &&
      winnerTournamentTeamId !== homeTournamentTeamId &&
      winnerTournamentTeamId !== awayTournamentTeamId
    ) {
      throw ApiException.unprocessable(
        'The winner must be one of the slot participants.',
        'INVALID_SLOT_WINNER',
      );
    }
  }

  private assertMutable(status: TournamentStatus): void {
    if (
      status === TournamentStatus.COMPLETED ||
      status === TournamentStatus.CANCELLED
    ) {
      throw ApiException.conflict(
        'The tournament structure can no longer be changed.',
        'TOURNAMENT_NOT_MUTABLE',
      );
    }
  }

  private assertWinnerWritable(status: TournamentStatus): void {
    // COMPLETED is deliberately allowed here: a winner write is what reopens
    // a finished tournament. CANCELLED has no route back, so it stays closed.
    if (status === TournamentStatus.CANCELLED) {
      throw ApiException.conflict(
        'The tournament structure can no longer be changed.',
        'TOURNAMENT_NOT_MUTABLE',
      );
    }
  }

  private assertKnockoutFormat(format: TournamentFormat): void {
    if (
      format !== TournamentFormat.KNOCKOUT &&
      format !== TournamentFormat.GROUP_STAGE_KNOCKOUT
    ) {
      throw ApiException.unprocessable(
        'This tournament format does not have a knockout stage.',
        'INVALID_TOURNAMENT_FORMAT',
      );
    }
  }
}
