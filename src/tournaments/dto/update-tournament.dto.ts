import { ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentFormat } from '@prisma/client';
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
  ValidateIf,
} from 'class-validator';
import { EDITABLE_TOURNAMENT_STATUSES } from './create-tournament.dto';
import type { EditableTournamentStatus } from './create-tournament.dto';

export class UpdateTournamentDto {
  @ApiPropertyOptional({ example: 'Copa de Verão 2026' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seasonId?: number;

  @ApiPropertyOptional({ enum: TournamentFormat, enumName: 'TournamentFormat' })
  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @ApiPropertyOptional({ example: 'copa-2026' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  slug?: string;

  @ApiPropertyOptional({ example: 2, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;

  @ApiPropertyOptional({
    example: 'Jogos em quatro períodos de 10 minutos…',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  regulation?: string | null;

  @ApiPropertyOptional({
    enum: EDITABLE_TOURNAMENT_STATUSES,
  })
  @IsOptional()
  @IsIn(EDITABLE_TOURNAMENT_STATUSES, {
    message:
      'status must be one of DRAFT, REGISTRATION, IN_PROGRESS, CANCELLED',
  })
  status?: EditableTournamentStatus;

  @ApiPropertyOptional({ example: '2026-01-10T00:00:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  startsAt?: string | null;

  @ApiPropertyOptional({ example: '2026-03-15T00:00:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  endsAt?: string | null;

  @ApiPropertyOptional({
    example: '2025-11-01T00:00:00.000Z',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  registrationStartsAt?: string | null;

  @ApiPropertyOptional({
    example: '2025-12-15T23:59:59.000Z',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  registrationEndsAt?: string | null;
}
