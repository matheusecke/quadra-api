import { ApiProperty } from '@nestjs/swagger';

export class BracketSlotTeamResponseDto {
  @ApiProperty({ example: 21 })
  tournamentTeamId!: number;

  @ApiProperty({
    example: 'Engenharia',
    description: 'TournamentTeam.displayNameSnapshot — the registration snapshot.',
  })
  name!: string;

  @ApiProperty({
    example: 'ENG',
    description: 'Live Team.shortName; there is no snapshot column for it.',
  })
  shortName!: string;
}

export class BracketSlotMatchResponseDto {
  @ApiProperty({ example: 501 })
  id!: number;

  @ApiProperty({ example: 'FINISHED' })
  status!: string;

  @ApiProperty({ example: '2026-08-01T20:00:00.000Z', nullable: true })
  date!: Date | null;

  @ApiProperty({ example: 78, nullable: true })
  homeScore!: number | null;

  @ApiProperty({ example: 72, nullable: true })
  awayScore!: number | null;
}

export class BracketSlotResponseDto {
  @ApiProperty({ example: 101 })
  id!: number;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: null, nullable: true })
  label!: string | null;

  @ApiProperty({ type: BracketSlotTeamResponseDto, nullable: true })
  homeTeam!: BracketSlotTeamResponseDto | null;

  @ApiProperty({ type: BracketSlotTeamResponseDto, nullable: true })
  awayTeam!: BracketSlotTeamResponseDto | null;

  @ApiProperty({
    type: BracketSlotMatchResponseDto,
    nullable: true,
    description: 'Always null until Phase 7 links matches to slots.',
  })
  match!: BracketSlotMatchResponseDto | null;

  @ApiProperty({ example: null, nullable: true })
  winnerTournamentTeamId!: number | null;
}

export class BracketRoundResponseDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 1 })
  number!: number;

  @ApiProperty({ example: 'Semifinais', nullable: true })
  label!: string | null;

  @ApiProperty({ type: BracketSlotResponseDto, isArray: true })
  slots!: BracketSlotResponseDto[];
}

export class BracketResponseDto {
  @ApiProperty({ type: BracketRoundResponseDto, isArray: true })
  rounds!: BracketRoundResponseDto[];
}
