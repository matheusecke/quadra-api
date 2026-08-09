import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTeamAffiliationDto {
  @ApiPropertyOptional({ example: 8 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @IsPositive()
  teamId?: number;

  @ApiPropertyOptional({ example: 'Águias Campinas', maxLength: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  teamName?: string;

  @ApiProperty({ example: 42 })
  @IsInt()
  @IsPositive()
  adminUserId!: number;
}
