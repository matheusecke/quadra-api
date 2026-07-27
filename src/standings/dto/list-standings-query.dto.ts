import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListStandingsQueryDto {
  @ApiPropertyOptional({
    example: 7,
    description:
      'Restricts the response to one group table. Yields an empty list for LEAGUE and KNOCKOUT tournaments.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  groupId?: number;
}
