import { ApiProperty } from '@nestjs/swagger';

export class TournamentBracketSlotResponseDto {
  @ApiProperty({ example: 101 })
  id!: number;

  @ApiProperty({ example: 12 })
  tournamentId!: number;

  @ApiProperty({ example: 10 })
  roundId!: number;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: null, nullable: true })
  label!: string | null;

  @ApiProperty({ example: 21, nullable: true })
  homeTournamentTeamId!: number | null;

  @ApiProperty({ example: 22, nullable: true })
  awayTournamentTeamId!: number | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Set by the link-match route; null when no match is linked.',
  })
  matchId!: number | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description:
      'Set by the winner route; always one of the slot participants, or null.',
  })
  winnerTournamentTeamId!: number | null;

  @ApiProperty({ example: '2026-07-28T18:05:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-28T18:05:00.000Z' })
  updatedAt!: Date;
}
