import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateTournamentGroupTeamDto {
  @ApiProperty({ example: 7, description: 'TournamentGroup.id.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentGroupId!: number;

  @ApiProperty({ example: 41, description: 'TournamentTeam.id.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentTeamId!: number;
}
