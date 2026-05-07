import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';

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

  @ApiProperty({ nullable: true, enum: OrgRole, enumName: 'OrgRole' })
  role: OrgRole | null;
}
