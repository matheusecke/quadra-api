import { ApiProperty } from '@nestjs/swagger';
import { LossType, MatchResult, MatchStatus, PeriodType } from '@prisma/client';

export type MatchScoreSource = 'PERIODS' | 'AWARDED';

export class MatchBracketRoundResponseDto {
  @ApiProperty({ example: 31 }) id!: number;
  @ApiProperty({ example: 2 }) number!: number;
  @ApiProperty({ example: 'Semifinals', nullable: true })
  label!: string | null;
}

export class MatchTeamResponseDto {
  @ApiProperty({ example: 41 }) tournamentTeamId!: number;
  @ApiProperty({ example: 'Engineering' }) teamName!: string;
  @ApiProperty({ example: 78, nullable: true }) score!: number | null;
  @ApiProperty({ enum: MatchResult, nullable: true })
  result!: MatchResult | null;
  @ApiProperty({ enum: LossType, nullable: true })
  lossType!: LossType | null;
  @ApiProperty({ example: true, nullable: true })
  isWinner!: boolean | null;
}

export class MatchPeriodResponseDto {
  @ApiProperty({ example: 1 }) periodNumber!: number;
  @ApiProperty({ enum: PeriodType, enumName: 'PeriodType' })
  periodType!: PeriodType;
  @ApiProperty({ example: 20 }) homePoints!: number;
  @ApiProperty({ example: 18 }) awayPoints!: number;
  @ApiProperty({ example: null, nullable: true }) startedAt!: Date | null;
  @ApiProperty({ example: null, nullable: true }) endedAt!: Date | null;
}

export class PlayerMatchStatisticResponseDto {
  @ApiProperty({ example: 88 }) tournamentRosterId!: number;
  @ApiProperty({ example: 41 }) tournamentTeamId!: number;
  @ApiProperty({ example: 'Ana Silva' }) displayName!: string;
  @ApiProperty({ example: 24, nullable: true }) pts!: number | null;
  @ApiProperty({ example: 9, nullable: true }) fgm!: number | null;
  @ApiProperty({ example: 17, nullable: true }) fga!: number | null;
  @ApiProperty({ example: 3, nullable: true }) threeFgm!: number | null;
  @ApiProperty({ example: 7, nullable: true }) threeFga!: number | null;
  @ApiProperty({ example: 3, nullable: true }) ftm!: number | null;
  @ApiProperty({ example: 4, nullable: true }) fta!: number | null;
  @ApiProperty({ example: 8, nullable: true }) reb!: number | null;
  @ApiProperty({ example: 5, nullable: true }) ast!: number | null;
  @ApiProperty({ example: 2, nullable: true }) stl!: number | null;
  @ApiProperty({ example: 1, nullable: true }) blk!: number | null;
  @ApiProperty({ example: 3, nullable: true }) tov!: number | null;
  @ApiProperty({ example: 2, nullable: true }) pf!: number | null;
  @ApiProperty({ example: 1980, nullable: true })
  minutesSeconds!: number | null;
}

export class MatchMvpResponseDto {
  @ApiProperty({ example: 88 }) tournamentRosterId!: number;
  @ApiProperty({ example: 'Ana Silva' }) displayName!: string;
}

export class MatchSummaryResponseDto {
  @ApiProperty({ example: 501 }) id!: number;
  @ApiProperty({ example: 12 }) tournamentId!: number;
  @ApiProperty({ example: 7, nullable: true })
  tournamentGroupId!: number | null;
  @ApiProperty({ example: 18, nullable: true }) matchNumber!: number | null;
  @ApiProperty({ enum: MatchStatus, enumName: 'MatchStatus' })
  status!: MatchStatus;
  @ApiProperty({ example: '2026-08-15T19:30:00.000Z' })
  scheduledAt!: Date;
  @ApiProperty({ example: null, nullable: true }) startedAt!: Date | null;
  @ApiProperty({ example: null, nullable: true }) endedAt!: Date | null;
  @ApiProperty({ example: 'Central Arena', nullable: true })
  venueName!: string | null;
  @ApiProperty({ type: MatchBracketRoundResponseDto, nullable: true })
  bracketRound!: MatchBracketRoundResponseDto | null;
  @ApiProperty({ enum: ['PERIODS', 'AWARDED'], nullable: true })
  scoreSource!: MatchScoreSource | null;
  @ApiProperty({ type: MatchTeamResponseDto })
  homeTeam!: MatchTeamResponseDto;
  @ApiProperty({ type: MatchTeamResponseDto })
  awayTeam!: MatchTeamResponseDto;
}

export class MatchDetailResponseDto extends MatchSummaryResponseDto {
  @ApiProperty({ type: MatchPeriodResponseDto, isArray: true })
  periods!: MatchPeriodResponseDto[];
  @ApiProperty({ type: PlayerMatchStatisticResponseDto, isArray: true })
  playerStats!: PlayerMatchStatisticResponseDto[];
  @ApiProperty({ type: MatchMvpResponseDto, nullable: true })
  mvp!: MatchMvpResponseDto | null;
}
