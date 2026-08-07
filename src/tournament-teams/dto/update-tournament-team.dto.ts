import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class UpdateTournamentTeamDto {
  @ApiPropertyOptional({ example: 1, nullable: true, minimum: 1 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  seed?: number | null;
}
