import { ApiProperty } from '@nestjs/swagger';

export class TournamentGroupResponseDto {
  @ApiProperty({ example: 7 })
  id!: number;

  @ApiProperty({ example: 12 })
  tournamentId!: number;

  @ApiProperty({ example: 'Group A' })
  name!: string;

  @ApiProperty({ example: 1, nullable: true })
  sortOrder!: number | null;

  @ApiProperty({ example: '2026-07-26T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-26T18:00:00.000Z' })
  updatedAt!: Date;
}
