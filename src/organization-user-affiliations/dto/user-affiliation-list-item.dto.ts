import { ApiProperty } from '@nestjs/swagger';
import { UserAffiliationResponseDto } from './user-affiliation-response.dto';

export class UserAffiliationListItemDto extends UserAffiliationResponseDto {
  @ApiProperty({ example: false })
  isInviteExpired!: boolean;

  @ApiProperty({ example: true })
  canManage!: boolean;
}
