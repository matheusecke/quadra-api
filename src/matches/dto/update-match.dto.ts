import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, Min, ValidateIf } from 'class-validator';
import { CreateMatchDto } from './create-match.dto';

// NOTE: PartialType applies @IsOptional(), which class-validator treats as "skip
// every validator" for an explicit null, not only for an absent key. The three
// fields below accept no null, so they are omitted from the partial base and
// re-declared with a presence-only condition instead.
const isSent = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class UpdateMatchDto extends PartialType(
  OmitType(CreateMatchDto, [
    'tournamentId',
    'scheduledAt',
    'homeTournamentTeamId',
    'awayTournamentTeamId',
  ] as const),
) {
  @ApiPropertyOptional({ example: '2026-08-18T20:00:00.000Z' })
  @ValidateIf(isSent)
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 41, minimum: 1 })
  @ValidateIf(isSent)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  homeTournamentTeamId?: number;

  @ApiPropertyOptional({ example: 52, minimum: 1 })
  @ValidateIf(isSent)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  awayTournamentTeamId?: number;
}
