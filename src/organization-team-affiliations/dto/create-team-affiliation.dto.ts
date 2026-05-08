import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class CreateTeamAffiliationDto {
  @ApiProperty({ description: 'ID of the team to invite' })
  @IsInt()
  @IsPositive()
  teamId: number;
}
