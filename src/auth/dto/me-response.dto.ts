import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

export class MeResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'User Name' })
  name!: string;

  @ApiProperty({ example: false })
  isSystemAdmin!: boolean;

  @ApiProperty({
    nullable: true,
    example: 1,
    description: 'Active organization id encoded in the access token, if any.',
  })
  organizationId!: number | null;

  @ApiProperty({
    nullable: true,
    enum: OrgRole,
    enumName: 'OrgRole',
    description: 'Role within `organizationId`, if org-scoped.',
  })
  role!: OrgRole | null;
}
