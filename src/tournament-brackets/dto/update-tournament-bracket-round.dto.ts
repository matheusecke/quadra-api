import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateTournamentBracketRoundDto {
  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number?: number;

  @ApiPropertyOptional({
    example: 'Quartas de final',
    nullable: true,
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string | null;
}
