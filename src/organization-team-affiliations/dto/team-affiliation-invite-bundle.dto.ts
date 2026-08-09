import { ApiProperty } from '@nestjs/swagger';
import { TeamAffiliationResponseDto } from './team-affiliation-response.dto';
import { UserAffiliationResponseDto } from '../../organization-user-affiliations/dto/user-affiliation-response.dto';

/** Returned when creating or reusing a team affiliation and inviting its administrator. */
export class TeamAffiliationInviteBundleDto {
  @ApiProperty({ type: TeamAffiliationResponseDto })
  teamAffiliation!: TeamAffiliationResponseDto;

  @ApiProperty({ type: UserAffiliationResponseDto })
  userAffiliation!: UserAffiliationResponseDto;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  inviteToken!: string;

  @ApiProperty({ example: '2026-08-15T12:00:00.000Z' })
  inviteExpiresAt!: Date;
}
