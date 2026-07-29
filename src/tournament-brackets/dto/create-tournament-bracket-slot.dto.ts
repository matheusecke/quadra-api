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

export class CreateTournamentBracketSlotDto {
  @ApiProperty({ example: 10, description: 'TournamentBracketRound.id.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roundId!: number;

  @ApiProperty({
    example: 1,
    minimum: 1,
    description: 'Client-supplied ordering inside the round. Gaps are legal.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position!: number;

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

  @ApiPropertyOptional({
    example: 21,
    nullable: true,
    minimum: 1,
    description: 'TournamentTeam.id of the home participant.',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  homeTournamentTeamId?: number | null;

  @ApiPropertyOptional({
    example: 22,
    nullable: true,
    minimum: 1,
    description: 'TournamentTeam.id of the away participant.',
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  awayTournamentTeamId?: number | null;
}
