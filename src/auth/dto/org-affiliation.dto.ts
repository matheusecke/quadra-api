import { ApiProperty } from '@nestjs/swagger';
import type { OrgRole } from '@prisma/client';

export class OrgAffiliationDto {
  @ApiProperty()
  organizationId: number;

  @ApiProperty()
  organizationName: string;

  @ApiProperty()
  organizationSlug: string;

  @ApiProperty({ enum: ['ORG_ADMIN', 'TEAM_ADMIN', 'ATHLETE', 'COACHING_STAFF'] })
  role: OrgRole;

  @ApiProperty({ nullable: true })
  teamId: number | null;
}
