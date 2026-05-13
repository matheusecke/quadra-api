import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliationStatus, OrgRole } from '@prisma/client';

export class UserAffiliationResponseDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 2 })
  userId!: number;

  @ApiProperty({ example: 1 })
  organizationId!: number;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole', example: OrgRole.ATHLETE })
  role!: OrgRole;

  @ApiPropertyOptional({ example: 3, nullable: true })
  teamId!: number | null;

  @ApiPropertyOptional({
    example: 10,
    nullable: true,
    description: 'Shirt number when applicable.',
  })
  jerseyNumber!: number | null;

  @ApiProperty({
    enum: AffiliationStatus,
    enumName: 'AffiliationStatus',
    example: AffiliationStatus.ACTIVE,
  })
  status!: AffiliationStatus;

  @ApiPropertyOptional({ example: 1, nullable: true })
  createdByUserId!: number | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-02T12:00:00.000Z' })
  updatedAt!: Date;
}
