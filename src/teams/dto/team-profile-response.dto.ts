import { ApiProperty } from '@nestjs/swagger';
import { BrazilianState } from '@prisma/client';

export enum TeamProfileStatus {
  ACTIVE = 'ACTIVE',
  HISTORICAL = 'HISTORICAL',
  INACTIVE = 'INACTIVE',
}

export class TeamProfileIdentityResponseDto {
  @ApiProperty({ example: 8 }) id!: number;
  @ApiProperty({ example: 'Engenharia PUC' }) name!: string;
  @ApiProperty({ example: 'EPU' }) shortName!: string;
  @ApiProperty({ example: 'Campinas', nullable: true }) city!: string | null;
  @ApiProperty({
    enum: BrazilianState,
    enumName: 'BrazilianState',
    nullable: true,
  })
  state!: BrazilianState | null;
  @ApiProperty({ enum: TeamProfileStatus, enumName: 'TeamProfileStatus' })
  status!: TeamProfileStatus;
}

export class TeamTitleTournamentResponseDto {
  @ApiProperty({ example: 12 }) id!: number;
  @ApiProperty({ example: 'Intercursos 2026' }) name!: string;
  @ApiProperty({ example: 7 }) seasonId!: number;
  @ApiProperty({ example: '2026' }) seasonLabel!: string;
  @ApiProperty({ example: '2026-05-02T12:00:00.000Z', nullable: true })
  startsAt!: Date | null;
  @ApiProperty({ example: '2026-06-20T12:00:00.000Z', nullable: true })
  endsAt!: Date | null;
}

export class TeamTitleResponseDto {
  @ApiProperty({ type: TeamTitleTournamentResponseDto })
  tournament!: TeamTitleTournamentResponseDto;
}

export class TeamResultStatisticsResponseDto {
  @ApiProperty({ example: 4 }) measuredGames!: number;
  @ApiProperty({ example: 0.5, nullable: true }) winRate!: number | null;
  @ApiProperty({ example: 2 }) scoreMeasuredGames!: number;
  @ApiProperty({ example: 70, nullable: true }) pointsForPerGame!:
    | number
    | null;
  @ApiProperty({ example: 67.5, nullable: true }) pointsAgainstPerGame!:
    | number
    | null;
  @ApiProperty({ example: 2.5, nullable: true }) pointDiffPerGame!:
    | number
    | null;
}

export class TeamBoxScoreMeasuredGamesResponseDto {
  @ApiProperty({ example: 2 }) reb!: number;
  @ApiProperty({ example: 1 }) ast!: number;
  @ApiProperty({ example: 2 }) stl!: number;
  @ApiProperty({ example: 1 }) blk!: number;
  @ApiProperty({ example: 2 }) tov!: number;
  @ApiProperty({ example: 2 }) pf!: number;
}

export class TeamBoxScorePerGameResponseDto {
  @ApiProperty({ example: 6, nullable: true }) reb!: number | null;
  @ApiProperty({ example: 5, nullable: true }) ast!: number | null;
  @ApiProperty({ example: 1.5, nullable: true }) stl!: number | null;
  @ApiProperty({ example: 1, nullable: true }) blk!: number | null;
  @ApiProperty({ example: 3.5, nullable: true }) tov!: number | null;
  @ApiProperty({ example: 1.5, nullable: true }) pf!: number | null;
}

export class TeamShootingStatisticsResponseDto {
  @ApiProperty({ example: 0.522, nullable: true }) fgPct!: number | null;
  @ApiProperty({ example: 0.375, nullable: true }) threeFgPct!: number | null;
  @ApiProperty({ example: 0.6, nullable: true }) ftPct!: number | null;
  @ApiProperty({ example: 0.595, nullable: true }) trueShootingPct!:
    | number
    | null;
}

export class TeamEfficiencyStatisticsResponseDto {
  @ApiProperty({ example: 1 }) measuredGames!: number;
  @ApiProperty({ example: 33, nullable: true }) perGame!: number | null;
}

export class TeamBoxScoreStatisticsResponseDto {
  @ApiProperty({ type: TeamBoxScoreMeasuredGamesResponseDto })
  measuredGames!: TeamBoxScoreMeasuredGamesResponseDto;
  @ApiProperty({ type: TeamBoxScorePerGameResponseDto })
  perGame!: TeamBoxScorePerGameResponseDto;
  @ApiProperty({ type: TeamShootingStatisticsResponseDto })
  shooting!: TeamShootingStatisticsResponseDto;
  @ApiProperty({ type: TeamEfficiencyStatisticsResponseDto })
  efficiency!: TeamEfficiencyStatisticsResponseDto;
}

export class TeamStatisticsResponseDto {
  @ApiProperty({ type: TeamResultStatisticsResponseDto })
  results!: TeamResultStatisticsResponseDto;
  @ApiProperty({ type: TeamBoxScoreStatisticsResponseDto })
  boxScore!: TeamBoxScoreStatisticsResponseDto;
}

export class TeamSummaryResponseDto {
  @ApiProperty({ type: TeamProfileIdentityResponseDto })
  team!: TeamProfileIdentityResponseDto;
  @ApiProperty({ type: TeamTitleResponseDto, isArray: true })
  titles!: TeamTitleResponseDto[];
  @ApiProperty({ type: TeamStatisticsResponseDto })
  statistics!: TeamStatisticsResponseDto;
}
