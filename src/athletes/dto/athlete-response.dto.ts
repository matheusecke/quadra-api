import { ApiProperty } from '@nestjs/swagger';
import {
  BasketballPosition,
  EntityStatus,
  LossType,
  MatchResult,
} from '@prisma/client';
import { StatisticsResponseDto } from '../../statistics/dto/statistics-response.dto';

export class AthleteProfileResponseDto {
  @ApiProperty({ example: 165 }) id!: number;
  @ApiProperty({ example: 'Rafael Moura' }) name!: string;
  @ApiProperty({ example: 8, nullable: true }) currentTeamId!: number | null;
  @ApiProperty({ example: 7, nullable: true }) jerseyNumber!: number | null;
  @ApiProperty({ enum: BasketballPosition, nullable: true })
  position!: BasketballPosition | null;
  @ApiProperty({ enum: EntityStatus, enumName: 'EntityStatus' })
  status!: EntityStatus;
}

export class AthleteMatchReferenceResponseDto {
  @ApiProperty({ example: 501 }) id!: number;
  @ApiProperty({ example: '2026-08-15T19:30:00.000Z' }) scheduledAt!: Date;
}
export class AthleteTournamentReferenceResponseDto {
  @ApiProperty({ example: 12 }) id!: number;
  @ApiProperty({ example: 'Intercursos 2026' }) name!: string;
}
export class AthleteTeamResponseDto {
  @ApiProperty({ example: 41 }) tournamentTeamId!: number;
  @ApiProperty({ example: 8 }) teamId!: number;
  @ApiProperty({ example: 'Engenharia PUC' }) name!: string;
}
export class AthleteMatchResultResponseDto {
  @ApiProperty({ enum: MatchResult }) result!: MatchResult;
  @ApiProperty({ enum: LossType, nullable: true }) lossType!: LossType | null;
  @ApiProperty({ example: 78 }) pointsFor!: number;
  @ApiProperty({ example: 70 }) pointsAgainst!: number;
}
export class AthleteMatchStatisticResponseDto {
  @ApiProperty({ example: 88 }) tournamentRosterId!: number;
  @ApiProperty({ example: 1980, nullable: true }) minutesSeconds!:
    | number
    | null;
  @ApiProperty({ example: 24, nullable: true }) pts!: number | null;
  @ApiProperty({ example: 8, nullable: true }) reb!: number | null;
  @ApiProperty({ example: 5, nullable: true }) ast!: number | null;
  @ApiProperty({ example: 2, nullable: true }) stl!: number | null;
  @ApiProperty({ example: 1, nullable: true }) blk!: number | null;
  @ApiProperty({ example: 3, nullable: true }) tov!: number | null;
  @ApiProperty({ example: 2, nullable: true }) pf!: number | null;
  @ApiProperty({ example: 9, nullable: true }) fgm!: number | null;
  @ApiProperty({ example: 17, nullable: true }) fga!: number | null;
  @ApiProperty({ example: 3, nullable: true }) threeFgm!: number | null;
  @ApiProperty({ example: 7, nullable: true }) threeFga!: number | null;
  @ApiProperty({ example: 3, nullable: true }) ftm!: number | null;
  @ApiProperty({ example: 4, nullable: true }) fta!: number | null;
}
export class AthleteDerivedStatisticResponseDto {
  @ApiProperty({ example: 0.529, nullable: true }) fgPct!: number | null;
  @ApiProperty({ example: 0.429, nullable: true }) threeFgPct!: number | null;
  @ApiProperty({ example: 0.75, nullable: true }) ftPct!: number | null;
  @ApiProperty({ example: 0.64, nullable: true })
  trueShootingPct!: number | null;
  @ApiProperty({ example: 28, nullable: true }) efficiency!: number | null;
}
export class AthleteMatchResponseDto {
  @ApiProperty({ type: AthleteMatchReferenceResponseDto })
  match!: AthleteMatchReferenceResponseDto;
  @ApiProperty({ type: AthleteTournamentReferenceResponseDto })
  tournament!: AthleteTournamentReferenceResponseDto;
  @ApiProperty({ example: 'Rafael Moura' }) athleteName!: string;
  @ApiProperty({ type: AthleteTeamResponseDto }) team!: AthleteTeamResponseDto;
  @ApiProperty({ type: AthleteTeamResponseDto })
  opponent!: AthleteTeamResponseDto;
  @ApiProperty({ type: AthleteMatchResultResponseDto })
  result!: AthleteMatchResultResponseDto;
  @ApiProperty({ type: AthleteMatchStatisticResponseDto })
  stats!: AthleteMatchStatisticResponseDto;
  @ApiProperty({ type: AthleteDerivedStatisticResponseDto })
  derived!: AthleteDerivedStatisticResponseDto;
}
export class AthleteTournamentSummaryResponseDto {
  @ApiProperty({ example: 12 }) id!: number;
  @ApiProperty({ example: 'Intercursos 2026' }) name!: string;
  @ApiProperty({ example: 7 }) seasonId!: number;
  @ApiProperty({ example: '2026-08-01T00:00:00.000Z', nullable: true })
  startsAt!: Date | null;
}
export class AthleteTournamentResponseDto {
  @ApiProperty({ type: AthleteTournamentSummaryResponseDto })
  tournament!: AthleteTournamentSummaryResponseDto;
  @ApiProperty({ type: AthleteTeamResponseDto }) team!: AthleteTeamResponseDto;
  @ApiProperty({ type: StatisticsResponseDto })
  statistics!: StatisticsResponseDto;
}
