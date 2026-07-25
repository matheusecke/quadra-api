import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTournamentCategoryDto {
  @ApiProperty({ example: 'Sub-17' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Manual display order. Omitted means unordered — sorted last.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
