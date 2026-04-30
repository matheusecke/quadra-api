import { ApiProperty } from '@nestjs/swagger';
import type { OrgRole } from '@prisma/client';

export class MeResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isSystemAdmin: boolean;

  @ApiProperty({ nullable: true })
  organizationId: number | null;

  @ApiProperty({ nullable: true, enum: ['ORG_ADMIN', 'TEAM_ADMIN', 'ATHLETE', 'COACHING_STAFF'] })
  role: OrgRole | null;
}
