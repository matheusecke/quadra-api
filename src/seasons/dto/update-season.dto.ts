import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateSeasonDto {
  @ApiPropertyOptional({ example: 'Temporada 2025/26' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  label?: string;

  @ApiPropertyOptional({ example: '2025-08-01' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'startDate must be a date in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'endDate must be a date in YYYY-MM-DD format' })
  endDate?: string;
}
