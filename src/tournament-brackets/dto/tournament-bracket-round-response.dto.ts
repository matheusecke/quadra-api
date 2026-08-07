import { ApiProperty } from '@nestjs/swagger';

export class TournamentBracketRoundResponseDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 12 })
  tournamentId!: number;

  @ApiProperty({ example: 1 })
  number!: number;

  @ApiProperty({ example: 'Semifinais', nullable: true })
  label!: string | null;

  @ApiProperty({ example: '2026-07-28T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-28T18:00:00.000Z' })
  updatedAt!: Date;
}
