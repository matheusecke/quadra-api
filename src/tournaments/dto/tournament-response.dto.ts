import { ApiProperty } from '@nestjs/swagger';
import { TournamentFormat, TournamentStatus } from '@prisma/client';

export class TournamentResponseDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: 'Copa de Verão' })
  name!: string;

  @ApiProperty({ example: 'copa-de-verao-2025-26', nullable: true })
  slug!: string | null;

  @ApiProperty({ example: 3 })
  seasonId!: number;

  @ApiProperty({ example: 2, nullable: true })
  categoryId!: number | null;

  @ApiProperty({
    example: 'Jogos em quatro períodos de 10 minutos…',
    nullable: true,
  })
  regulation!: string | null;

  @ApiProperty({ enum: TournamentFormat, enumName: 'TournamentFormat' })
  format!: TournamentFormat;

  @ApiProperty({ enum: TournamentStatus, enumName: 'TournamentStatus' })
  status!: TournamentStatus;

  @ApiProperty({ example: '2026-01-10T00:00:00.000Z', nullable: true })
  startsAt!: Date | null;

  @ApiProperty({ example: '2026-03-15T00:00:00.000Z', nullable: true })
  endsAt!: Date | null;

  @ApiProperty({ example: '2025-11-01T00:00:00.000Z', nullable: true })
  registrationStartsAt!: Date | null;

  @ApiProperty({ example: '2025-12-15T23:59:59.000Z', nullable: true })
  registrationEndsAt!: Date | null;

  @ApiProperty({ example: false })
  isRegistrationOpen!: boolean;

  @ApiProperty({ example: null, nullable: true })
  championTournamentTeamId!: number | null;

  @ApiProperty({ example: null, nullable: true })
  mvpTournamentRosterId!: number | null;

  @ApiProperty({ example: 8 })
  enrolledTeamCount!: number;

  @ApiProperty({ example: 14 })
  matchCount!: number;

  @ApiProperty({ example: 9 })
  finishedMatchCount!: number;

  @ApiProperty({ example: '2025-10-02T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-02-20T18:44:03.117Z' })
  updatedAt!: Date;
}
