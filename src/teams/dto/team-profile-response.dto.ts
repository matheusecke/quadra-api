import { ApiProperty } from '@nestjs/swagger';
import {
  BrazilianState,
  LossType,
  MatchResult,
  MatchStatus,
  TournamentStatus,
  TournamentTeamStatus,
} from '@prisma/client';
import type { MatchScoreSource } from '../../matches/match-score-source';

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
  @ApiProperty({ example: 18 }) measuredGames!: number;
  @ApiProperty({ example: 0.667, nullable: true }) winRate!: number | null;
  @ApiProperty({ example: 16 }) scoreMeasuredGames!: number;
  @ApiProperty({ example: 73.125, nullable: true }) pointsForPerGame!:
    | number
    | null;
  @ApiProperty({ example: 68.5, nullable: true }) pointsAgainstPerGame!:
    | number
    | null;
  @ApiProperty({ example: 4.625, nullable: true }) pointDiffPerGame!:
    | number
    | null;
}

export class TeamBoxScoreMeasuredGamesResponseDto {
  @ApiProperty({ example: 14 }) reb!: number;
  @ApiProperty({ example: 14 }) ast!: number;
  @ApiProperty({ example: 12 }) stl!: number;
  @ApiProperty({ example: 12 }) blk!: number;
  @ApiProperty({ example: 14 }) tov!: number;
  @ApiProperty({ example: 14 }) pf!: number;
}

export class TeamBoxScorePerGameResponseDto {
  @ApiProperty({ example: 38.286, nullable: true }) reb!: number | null;
  @ApiProperty({ example: 17.143, nullable: true }) ast!: number | null;
  @ApiProperty({ example: 7.5, nullable: true }) stl!: number | null;
  @ApiProperty({ example: 3.25, nullable: true }) blk!: number | null;
  @ApiProperty({ example: 11.786, nullable: true }) tov!: number | null;
  @ApiProperty({ example: 16.214, nullable: true }) pf!: number | null;
}

export class TeamShootingStatisticsResponseDto {
  @ApiProperty({ example: 0.481, nullable: true }) fgPct!: number | null;
  @ApiProperty({ example: 0.354, nullable: true }) threeFgPct!: number | null;
  @ApiProperty({ example: 0.742, nullable: true }) ftPct!: number | null;
  @ApiProperty({ example: 0.571, nullable: true }) trueShootingPct!:
    | number
    | null;
}

export class TeamEfficiencyStatisticsResponseDto {
  @ApiProperty({ example: 12 }) measuredGames!: number;
  @ApiProperty({ example: 82.417, nullable: true }) perGame!: number | null;
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

export class TeamMatchReferenceResponseDto {
  @ApiProperty({ example: 501 }) id!: number;
  @ApiProperty({ enum: MatchStatus, enumName: 'MatchStatus' })
  status!: MatchStatus;
  @ApiProperty({ example: '2026-08-15T19:30:00.000Z' })
  scheduledAt!: Date;
  @ApiProperty({ example: 'Central Arena', nullable: true })
  venueName!: string | null;
  @ApiProperty({ enum: ['PERIODS', 'AWARDED'], nullable: true })
  scoreSource!: MatchScoreSource | null;
}

export class TeamTournamentReferenceResponseDto {
  @ApiProperty({ example: 12 }) id!: number;
  @ApiProperty({ example: 'Intercursos 2026' }) name!: string;
  @ApiProperty({ example: 7 }) seasonId!: number;
  @ApiProperty({ example: '2026' }) seasonLabel!: string;
}

export class TeamMatchParticipantResponseDto {
  @ApiProperty({ example: 41 }) tournamentTeamId!: number;
  @ApiProperty({ example: 8 }) teamId!: number;
  @ApiProperty({ example: 'Engenharia PUC' }) name!: string;
  @ApiProperty({ example: 78, nullable: true }) score!: number | null;
  @ApiProperty({ enum: MatchResult, nullable: true })
  result!: MatchResult | null;
  @ApiProperty({ enum: LossType, nullable: true })
  lossType!: LossType | null;
  @ApiProperty({ example: true, nullable: true })
  isWinner!: boolean | null;
}

export class TeamMatchResponseDto {
  @ApiProperty({ type: TeamMatchReferenceResponseDto })
  match!: TeamMatchReferenceResponseDto;
  @ApiProperty({ type: TeamTournamentReferenceResponseDto })
  tournament!: TeamTournamentReferenceResponseDto;
  @ApiProperty({ type: TeamMatchParticipantResponseDto })
  team!: TeamMatchParticipantResponseDto;
  @ApiProperty({ type: TeamMatchParticipantResponseDto })
  opponent!: TeamMatchParticipantResponseDto;
}

export class TeamTournamentHistoryReferenceResponseDto {
  @ApiProperty({ example: 12 }) id!: number;
  @ApiProperty({ example: 'Intercursos 2026' }) name!: string;
  @ApiProperty({ example: 7 }) seasonId!: number;
  @ApiProperty({ example: '2026' }) seasonLabel!: string;
  @ApiProperty({ enum: TournamentStatus, enumName: 'TournamentStatus' })
  status!: TournamentStatus;
  @ApiProperty({ nullable: true, example: '2026-05-02T12:00:00.000Z' })
  startsAt!: Date | null;
  @ApiProperty({ nullable: true, example: '2026-06-20T12:00:00.000Z' })
  endsAt!: Date | null;
}

export class TeamTournamentParticipantResponseDto {
  @ApiProperty({ example: 41 }) tournamentTeamId!: number;
  @ApiProperty({ example: 8 }) teamId!: number;
  @ApiProperty({ example: 'Engenharia PUC' }) name!: string;
  @ApiProperty({
    enum: TournamentTeamStatus,
    enumName: 'TournamentTeamStatus',
  })
  status!: TournamentTeamStatus;
  @ApiProperty({ example: true }) isChampion!: boolean;
}

export class TeamTournamentResponseDto {
  @ApiProperty({ type: TeamTournamentHistoryReferenceResponseDto })
  tournament!: TeamTournamentHistoryReferenceResponseDto;
  @ApiProperty({ type: TeamTournamentParticipantResponseDto })
  team!: TeamTournamentParticipantResponseDto;
  @ApiProperty({ type: TeamStatisticsResponseDto })
  statistics!: TeamStatisticsResponseDto;
}
