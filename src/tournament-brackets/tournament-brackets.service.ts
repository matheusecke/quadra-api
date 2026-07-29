import { Injectable } from '@nestjs/common';
import { Prisma, TournamentFormat, TournamentStatus } from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  BracketResponseDto,
  BracketRoundResponseDto,
  BracketSlotTeamResponseDto,
} from './dto/bracket-response.dto';
import { CreateTournamentBracketRoundDto } from './dto/create-tournament-bracket-round.dto';
import { TournamentBracketRoundResponseDto } from './dto/tournament-bracket-round-response.dto';
import { UpdateTournamentBracketRoundDto } from './dto/update-tournament-bracket-round.dto';

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
      homeTournamentTeam: { select: bracketSlotTeamSelect },
      awayTournamentTeam: { select: bracketSlotTeamSelect },
    },
  },
} satisfies Prisma.TournamentBracketRoundSelect;

type BracketRoundReadRow = Prisma.TournamentBracketRoundGetPayload<{
  select: typeof bracketReadSelect;
}>;

type BracketSlotTeamRow = BracketRoundReadRow['slots'][number]['homeTournamentTeam'];

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
        // NOTE: Phase 7 links matches to slots; until then no match projection exists.
        match: null,
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
