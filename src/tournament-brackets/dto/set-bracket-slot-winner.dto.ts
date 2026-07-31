import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsInt, Min, ValidateIf } from 'class-validator';

export class SetBracketSlotWinnerDto {
  @ApiProperty({
    example: 21,
    nullable: true,
    minimum: 1,
    description:
      'TournamentTeam.id of the slot participant that advanced, or null to clear it. The key is required; omitting it is a validation error.',
  })
  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  winnerTournamentTeamId!: number | null;
}
