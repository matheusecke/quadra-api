import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMatchDto {
  @ApiProperty({ example: 12, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentId!: number;

  @ApiPropertyOptional({ example: 7, minimum: 1, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentGroupId?: number | null;

  @ApiPropertyOptional({ example: 18, minimum: 1, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  matchNumber?: number | null;

  @ApiProperty({ example: '2026-08-15T19:30:00.000Z' })
  @IsISO8601()
  scheduledAt!: string;

  @ApiPropertyOptional({ example: 'Central Arena', nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  venueName?: string | null;

  @ApiProperty({ example: 41, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  homeTournamentTeamId!: number;

  @ApiProperty({ example: 52, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  awayTournamentTeamId!: number;
}
