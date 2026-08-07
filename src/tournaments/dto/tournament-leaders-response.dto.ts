import { ApiProperty } from '@nestjs/swagger';

export class TournamentLeaderEntryResponseDto {
  @ApiProperty({ example: 165 }) athleteId!: number;
  @ApiProperty({ example: 'Rafael Moura' }) athleteName!: string;
  @ApiProperty({ example: 41 }) tournamentTeamId!: number;
  @ApiProperty({ example: 8 }) teamId!: number;
  @ApiProperty({ example: 'Engenharia PUC' }) teamName!: string;
  @ApiProperty({ example: 20 }) value!: number;
  @ApiProperty({ example: 6 }) gamesPlayed!: number;
}

export class TournamentPerGameLeadersResponseDto {
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  ppg!: TournamentLeaderEntryResponseDto[];
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  rpg!: TournamentLeaderEntryResponseDto[];
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  apg!: TournamentLeaderEntryResponseDto[];
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  stg!: TournamentLeaderEntryResponseDto[];
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  bpg!: TournamentLeaderEntryResponseDto[];
}

export class TournamentTotalLeadersResponseDto {
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  pts!: TournamentLeaderEntryResponseDto[];
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  reb!: TournamentLeaderEntryResponseDto[];
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  ast!: TournamentLeaderEntryResponseDto[];
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  stl!: TournamentLeaderEntryResponseDto[];
  @ApiProperty({ type: TournamentLeaderEntryResponseDto, isArray: true })
  blk!: TournamentLeaderEntryResponseDto[];
}

export class TournamentLeadersResponseDto {
  @ApiProperty({ type: TournamentPerGameLeadersResponseDto })
  perGame!: TournamentPerGameLeadersResponseDto;
  @ApiProperty({ type: TournamentTotalLeadersResponseDto })
  totals!: TournamentTotalLeadersResponseDto;
}
