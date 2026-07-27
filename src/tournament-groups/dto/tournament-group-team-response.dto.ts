import { ApiProperty } from '@nestjs/swagger';

export class TournamentGroupTeamResponseDto {
  @ApiProperty({ example: 31 })
  id!: number;

  @ApiProperty({ example: 12 })
  tournamentId!: number;

  @ApiProperty({ example: 7 })
  tournamentGroupId!: number;

  @ApiProperty({ example: 41 })
  tournamentTeamId!: number;

  @ApiProperty({ example: '2026-07-26T18:10:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-26T18:10:00.000Z' })
  updatedAt!: Date;
}
