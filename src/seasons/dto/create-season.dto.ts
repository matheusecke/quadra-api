import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateSeasonDto {
  @ApiProperty({ example: '2025/26' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  label: string;

  @ApiProperty({
    example: '2025-08-01',
    description: 'Calendar date, YYYY-MM-DD.',
  })
  @Matches(DATE_ONLY, {
    message: 'startDate must be a date in YYYY-MM-DD format',
  })
  startDate: string;

  @ApiProperty({
    example: '2026-07-31',
    description: 'Calendar date, YYYY-MM-DD.',
  })
  @Matches(DATE_ONLY, {
    message: 'endDate must be a date in YYYY-MM-DD format',
  })
  endDate: string;
}
