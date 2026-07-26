import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateTournamentTeamDto {
  @ApiProperty({ example: 8, description: 'Global Team.id.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamId!: number;
}
