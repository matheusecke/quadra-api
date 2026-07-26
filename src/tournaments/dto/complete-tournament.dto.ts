import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class CompleteTournamentDto {
  @ApiPropertyOptional({
    example: 41,
    nullable: true,
    description:
      'Required for LEAGUE/KNOCKOUT/GROUP_STAGE_KNOCKOUT, forbidden for GROUP_STAGE.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  championTournamentTeamId?: number | null;
}
