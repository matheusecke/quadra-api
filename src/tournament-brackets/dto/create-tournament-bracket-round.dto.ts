import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateTournamentBracketRoundDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
    description:
      'Client-supplied ordering. Gaps are legal and nothing renumbers.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number!: number;

  @ApiPropertyOptional({
    example: 'Semifinais',
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
