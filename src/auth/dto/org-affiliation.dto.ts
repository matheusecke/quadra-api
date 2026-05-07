import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

export class OrgAffiliationDto {
  @ApiProperty()
  organizationId: number;

  @ApiProperty()
  organizationName: string;

  @ApiProperty()
  organizationSlug: string;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole' })
  role: OrgRole;

  @ApiProperty({ nullable: true })
  teamId: number | null;
}
