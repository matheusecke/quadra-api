import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { TournamentFormat, TournamentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const EDITABLE_TOURNAMENT_STATUSES = [
  TournamentStatus.DRAFT,
  TournamentStatus.REGISTRATION,
  TournamentStatus.IN_PROGRESS,
  TournamentStatus.CANCELLED,
] as const;

export type EditableTournamentStatus =
  (typeof EDITABLE_TOURNAMENT_STATUSES)[number];

export class CreateTournamentDto {
  @ApiProperty({ example: 'Copa de Verão' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seasonId!: number;

  @ApiProperty({ enum: TournamentFormat, enumName: 'TournamentFormat' })
  @IsEnum(TournamentFormat)
  format!: TournamentFormat;

  @ApiPropertyOptional({ example: 'copa-verao-2026' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  slug?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ example: 'Jogos em quatro períodos de 10 minutos…' })
  @IsOptional()
  @IsString()
  regulation?: string;

  @ApiPropertyOptional({
    enum: EDITABLE_TOURNAMENT_STATUSES,
    default: TournamentStatus.DRAFT,
  })
  @IsOptional()
  @IsIn(EDITABLE_TOURNAMENT_STATUSES, {
    message:
      'status must be one of DRAFT, REGISTRATION, IN_PROGRESS, CANCELLED',
  })
  status?: EditableTournamentStatus;

  @ApiPropertyOptional({ example: '2026-01-10T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-03-15T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @ApiPropertyOptional({ example: '2025-11-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  registrationStartsAt?: string;

  @ApiPropertyOptional({ example: '2025-12-15T23:59:59.000Z' })
  @IsOptional()
  @IsISO8601()
  registrationEndsAt?: string;
}
