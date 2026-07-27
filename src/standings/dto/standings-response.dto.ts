import { ApiProperty } from '@nestjs/swagger';

export type StandingsState = 'EMPTY' | 'PARTIAL' | 'FINAL';

export class StandingsGroupResponseDto {
  @ApiProperty({ example: 7 })
  id!: number;

  @ApiProperty({ example: 'Grupo A' })
  name!: string;
}

export class StandingRowResponseDto {
  @ApiProperty({
    example: 1,
    nullable: true,
    description: 'Null if and only if the table is EMPTY.',
  })
  position!: number | null;

  @ApiProperty({ example: 41 })
  tournamentTeamId!: number;

  @ApiProperty({ example: 3 })
  teamId!: number;

  @ApiProperty({ example: 'Engenharia' })
  teamName!: string;

  @ApiProperty({ example: 4 })
  played!: number;

  @ApiProperty({ example: 3 })
  wins!: number;

  @ApiProperty({ example: 1 })
  losses!: number;

  @ApiProperty({
    example: 7,
    description:
      'FIBA Appendix D: 2 per win, 1 per loss, 0 per loss by forfeit.',
  })
  classificationPoints!: number;

  @ApiProperty({ example: 312 })
  pointsFor!: number;

  @ApiProperty({ example: 288 })
  pointsAgainst!: number;

  @ApiProperty({ example: 24 })
  pointDiff!: number;

  @ApiProperty({
    example: 0.75,
    nullable: true,
    description: 'Display only; never orders the table. Null when played is 0.',
  })
  winPct!: number | null;

  @ApiProperty({ example: false })
  isTiedUnresolved!: boolean;

  @ApiProperty({
    example: '58-63',
    nullable: true,
    description:
      'Ascending tournamentTeamIds joined by "-". Set on every row of a block that reached the draw criterion.',
  })
  tieBlockKey!: string | null;
}

export class StandingsTableResponseDto {
  @ApiProperty({ type: StandingsGroupResponseDto, nullable: true })
  group!: StandingsGroupResponseDto | null;

  @ApiProperty({ example: 'PARTIAL', enum: ['EMPTY', 'PARTIAL', 'FINAL'] })
  standingsState!: StandingsState;

  @ApiProperty({ example: 3 })
  pendingMatches!: number;

  @ApiProperty({ type: StandingRowResponseDto, isArray: true })
  rows!: StandingRowResponseDto[];
}
