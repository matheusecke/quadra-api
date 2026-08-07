import { ApiProperty } from '@nestjs/swagger';
import { RosterRole, RosterStatus } from '@prisma/client';

export class TournamentRosterResponseDto {
  @ApiProperty({ example: 88 })
  id!: number;

  @ApiProperty({ example: 12 })
  tournamentId!: number;

  @ApiProperty({ example: 41 })
  tournamentTeamId!: number;

  @ApiProperty({ example: 165 })
  userId!: number;

  @ApiProperty({ enum: RosterRole, enumName: 'RosterRole' })
  role!: RosterRole;

  @ApiProperty({ example: 7, nullable: true })
  jerseyNumber!: number | null;

  @ApiProperty({ example: 'Rafael Moura' })
  displayNameSnapshot!: string;

  @ApiProperty({ enum: RosterStatus, enumName: 'RosterStatus' })
  status!: RosterStatus;

  @ApiProperty({ example: '2026-01-03T11:30:00.000Z', nullable: true })
  joinedAt!: Date | null;

  @ApiProperty({ example: null, nullable: true })
  leftAt!: Date | null;

  @ApiProperty({ example: '2026-01-03T11:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-26T18:10:00.000Z' })
  updatedAt!: Date;
}
