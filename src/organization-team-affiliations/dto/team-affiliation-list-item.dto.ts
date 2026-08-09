import { ApiProperty } from '@nestjs/swagger';
import { TeamAffiliationResponseDto } from './team-affiliation-response.dto';

export class TeamAffiliationListItemDto extends TeamAffiliationResponseDto {
  @ApiProperty({ example: 14 })
  activeUserCount!: number;

  @ApiProperty({ example: 2 })
  pendingAdminInviteCount!: number;
}
