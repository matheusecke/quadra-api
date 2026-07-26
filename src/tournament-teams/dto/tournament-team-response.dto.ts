import { ApiProperty } from '@nestjs/swagger';
import { TournamentTeamStatus } from '@prisma/client';

export class TournamentTeamResponseDto {
  @ApiProperty({ example: 41 })
  id!: number;

  @ApiProperty({ example: 12 })
  tournamentId!: number;

  @ApiProperty({ example: 8 })
  teamId!: number;

  @ApiProperty({
    enum: TournamentTeamStatus,
    enumName: 'TournamentTeamStatus',
  })
  status!: TournamentTeamStatus;

  @ApiProperty({ example: 1, nullable: true })
  seed!: number | null;

  @ApiProperty({ example: null, nullable: true })
  tiebreakOrder!: number | null;

  @ApiProperty({ example: null, nullable: true })
  tiebreakBlockKey!: string | null;

  @ApiProperty({ example: 'Engenharia PUC' })
  displayNameSnapshot!: string;

  @ApiProperty({ example: '2026-01-02T14:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-26T18:00:00.000Z' })
  updatedAt!: Date;
}
