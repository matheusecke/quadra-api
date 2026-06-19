import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

export class OrgAffiliationDto {
  @ApiProperty({ example: 1 })
  organizationId!: number;

  @ApiProperty({ example: 'São Paulo FC' })
  organizationName!: string;

  @ApiProperty({ example: 'sao-paulo-fc' })
  organizationSlug!: string;

  @ApiProperty({
    enum: OrgRole,
    enumName: 'OrgRole',
    example: OrgRole.ORG_ADMIN,
  })
  role!: OrgRole;

  @ApiProperty({
    nullable: true,
    example: 3,
    description: 'Team scope when role is team-linked.',
  })
  teamId!: number | null;
}
