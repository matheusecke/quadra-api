import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliationStatus, OrgRole } from '@prisma/client';

export class MyInviteDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 1 })
  organizationId!: number;

  @ApiProperty({ example: 'São Paulo FC' })
  organizationName!: string;

  @ApiProperty({
    enum: OrgRole,
    enumName: 'OrgRole',
    example: OrgRole.ATHLETE,
  })
  role!: OrgRole;

  @ApiPropertyOptional({ example: 3, nullable: true })
  teamId!: number | null;

  @ApiPropertyOptional({ example: 'U20', nullable: true })
  teamName!: string | null;

  @ApiPropertyOptional({ example: 10, nullable: true })
  jerseyNumber!: number | null;

  @ApiProperty({
    enum: [AffiliationStatus.PENDING],
    example: AffiliationStatus.PENDING,
  })
  status!: Extract<AffiliationStatus, 'PENDING'>;

  @ApiProperty({ example: '2026-06-19T12:00:00.000Z' })
  sentAt!: string;

  @ApiPropertyOptional({
    example: '2026-06-26T12:00:00.000Z',
    nullable: true,
  })
  expiresAt!: string | null;

  @ApiProperty({ example: false })
  isExpired!: boolean;
}
