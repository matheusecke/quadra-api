import { Injectable } from '@nestjs/common';
import { Prisma, TournamentFormat, TournamentStatus } from '@prisma/client';
import { ApiException } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  BracketResponseDto,
  BracketRoundResponseDto,
  BracketSlotTeamResponseDto,
} from './dto/bracket-response.dto';

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
}
