import { ApiProperty } from '@nestjs/swagger';
import { TeamAffiliationResponseDto } from './team-affiliation-response.dto';

/** Returned when creating a team affiliation invite (raw token for delivery). */
export class TeamAffiliationInviteBundleDto {
  @ApiProperty({ type: TeamAffiliationResponseDto })
  affiliation!: TeamAffiliationResponseDto;

  @ApiProperty({
    description:
      'Raw invite token (64 chars) for the team-side acceptance flow.',
    example: 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
    minLength: 64,
    maxLength: 64,
  })
  inviteToken!: string;
}
