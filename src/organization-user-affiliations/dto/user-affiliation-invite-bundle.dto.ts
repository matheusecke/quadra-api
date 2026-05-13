import { ApiProperty } from '@nestjs/swagger';
import { UserAffiliationResponseDto } from './user-affiliation-response.dto';

/** Returned when creating or re-sending a user affiliation invite (raw token for delivery). */
export class UserAffiliationInviteBundleDto {
  @ApiProperty({ type: UserAffiliationResponseDto })
  affiliation!: UserAffiliationResponseDto;

  @ApiProperty({
    description: 'Raw invite token (64 chars) to deliver to the invited user.',
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    minLength: 64,
    maxLength: 64,
  })
  inviteToken!: string;
}
