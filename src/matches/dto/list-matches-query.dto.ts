import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { MatchStatus } from '@prisma/client';
import { Transform, type TransformFnParams, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

const trimOptionalQuery = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const repeatedPositiveIntegers = ({ value }: TransformFnParams): number[] =>
  (Array.isArray(value) ? value : [value]).map((item) => Number(item));

export class ListMatchesQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ example: 'engineering' })
  @IsOptional()
  @IsString()
  @Transform(trimOptionalQuery)
  q?: string;

  @ApiPropertyOptional({
    type: [Number],
    example: [501, 508],
    description: 'Repeat the param: ?ids=501&ids=508',
  })
  @IsOptional()
  @Transform(repeatedPositiveIntegers)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @ApiPropertyOptional({ example: 12, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentId?: number;

  @ApiPropertyOptional({
    type: [Number],
    example: [41, 52],
    description:
      'TournamentTeam ids. Repeat: ?tournamentTeamIds=41&tournamentTeamIds=52',
  })
  @IsOptional()
  @Transform(repeatedPositiveIntegers)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  tournamentTeamIds?: number[];

  @ApiPropertyOptional({ enum: MatchStatus, enumName: 'MatchStatus' })
  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;
}

export class ListTournamentMatchesQueryDto extends OmitType(
  ListMatchesQueryDto,
  ['tournamentId'] as const,
) {}
