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

export class UpdateTournamentBracketSlotDto {
  @ApiPropertyOptional({ example: 2, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position?: number;

  @ApiPropertyOptional({
    example: 'Final',
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

  @ApiPropertyOptional({ example: 23, nullable: true, minimum: 1 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  homeTournamentTeamId?: number | null;

  @ApiPropertyOptional({ example: 24, nullable: true, minimum: 1 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  awayTournamentTeamId?: number | null;
}
