import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class LinkBracketSlotMatchDto {
  @ApiProperty({
    example: 501,
    minimum: 1,
    description:
      'Match.id to attach to this slot. Must belong to the slot tournament, sit outside the group stage, not be cancelled, and not already be linked.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  matchId!: number;
}
