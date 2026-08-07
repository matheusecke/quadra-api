import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class TiebreakEntryDto {
  @ApiProperty({ example: 63, description: 'TournamentTeam.id.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentTeamId!: number;

  @ApiProperty({
    example: 1,
    description:
      'Rank inside the block. Must form a complete permutation of 1..n.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order!: number;
}

export class SetTiebreaksDto {
  @ApiProperty({
    type: TiebreakEntryDto,
    isArray: true,
    description:
      'Every team of one tied block. Array position is irrelevant; `order` carries the ranking.',
    example: [
      { tournamentTeamId: 63, order: 1 },
      { tournamentTeamId: 58, order: 2 },
    ],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique((entry: TiebreakEntryDto) => entry.tournamentTeamId)
  @ValidateNested({ each: true })
  @Type(() => TiebreakEntryDto)
  entries!: TiebreakEntryDto[];
}
