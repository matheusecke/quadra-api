import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LossType, PeriodType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const isSent = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class MatchPeriodInputDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodNumber!: number;

  @ApiProperty({ enum: PeriodType, enumName: 'PeriodType' })
  @IsEnum(PeriodType)
  periodType!: PeriodType;

  @ApiProperty({ example: 18, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  homePoints!: number;

  @ApiProperty({ example: 22, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  awayPoints!: number;
}

export class MatchPlayerStatisticInputDto {
  @ApiProperty({ example: 88, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentRosterId!: number;

  @ApiPropertyOptional({ example: 14, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pts?: number | null;

  @ApiPropertyOptional({ example: 5, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fgm?: number | null;

  @ApiPropertyOptional({ example: 11, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fga?: number | null;

  @ApiPropertyOptional({ example: 3, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  threeFgm?: number | null;

  @ApiPropertyOptional({ example: 7, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  threeFga?: number | null;

  @ApiPropertyOptional({ example: 4, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ftm?: number | null;

  @ApiPropertyOptional({ example: 5, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fta?: number | null;

  @ApiPropertyOptional({ example: 8, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reb?: number | null;

  @ApiPropertyOptional({ example: 3, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ast?: number | null;

  @ApiPropertyOptional({ example: 1, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stl?: number | null;

  @ApiPropertyOptional({ example: 0, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  blk?: number | null;

  @ApiPropertyOptional({ example: 2, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tov?: number | null;

  @ApiPropertyOptional({ example: 2, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pf?: number | null;

  @ApiPropertyOptional({ example: 1800, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minutesSeconds?: number | null;
}

export class SaveMatchDraftDto {
  @ApiPropertyOptional({ type: MatchPeriodInputDto, isArray: true })
  @ValidateIf(isSent)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchPeriodInputDto)
  periods?: MatchPeriodInputDto[];

  @ApiPropertyOptional({ type: MatchPlayerStatisticInputDto, isArray: true })
  @ValidateIf(isSent)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchPlayerStatisticInputDto)
  playerStats?: MatchPlayerStatisticInputDto[];

  @ApiPropertyOptional({ example: 88, minimum: 1, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  mvpTournamentRosterId?: number | null;
}

export class SubmitMatchResultDto {
  @ApiPropertyOptional({
    enum: LossType,
    enumName: 'MatchResultType',
    default: LossType.NORMAL,
  })
  @ValidateIf(isSent)
  @IsEnum(LossType)
  resultType?: LossType;

  @ApiPropertyOptional({ example: 52, minimum: 1 })
  @ValidateIf(isSent)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  offendingTournamentTeamId?: number;

  @ApiPropertyOptional({ type: MatchPeriodInputDto, isArray: true })
  @ValidateIf(isSent)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchPeriodInputDto)
  periods?: MatchPeriodInputDto[];

  @ApiPropertyOptional({ type: MatchPlayerStatisticInputDto, isArray: true })
  @ValidateIf(isSent)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchPlayerStatisticInputDto)
  playerStats?: MatchPlayerStatisticInputDto[];

  @ApiPropertyOptional({ example: 88, minimum: 1, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  mvpTournamentRosterId?: number | null;
}
