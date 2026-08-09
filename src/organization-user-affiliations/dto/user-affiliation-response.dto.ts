import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliationStatus, BasketballPosition, OrgRole } from '@prisma/client';

export class AffiliationUserDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 'João Silva' })
  name!: string;

  @ApiProperty({ example: 'joao@example.com' })
  email!: string;
}

export class AffiliationTeamDto {
  @ApiProperty({ example: 3 })
  id!: number;

  @ApiProperty({ example: 'Equipe A' })
  name!: string;
}

export class UserAffiliationResponseDto {
  @ApiProperty({ example: 10 })
  id!: number;

  @ApiProperty({ example: 2 })
  userId!: number;

  @ApiProperty({ type: () => AffiliationUserDto })
  user!: AffiliationUserDto;

  @ApiProperty({ example: 1 })
  organizationId!: number;

  @ApiProperty({ enum: OrgRole, enumName: 'OrgRole', example: OrgRole.ATHLETE })
  role!: OrgRole;

  @ApiPropertyOptional({ example: 3, nullable: true })
  teamId!: number | null;

  @ApiPropertyOptional({ type: () => AffiliationTeamDto, nullable: true })
  team!: AffiliationTeamDto | null;

  @ApiPropertyOptional({
    example: 10,
    nullable: true,
    description: 'Shirt number when applicable.',
  })
  jerseyNumber!: number | null;

  @ApiPropertyOptional({
    enum: BasketballPosition,
    enumName: 'BasketballPosition',
    nullable: true,
  })
  position!: BasketballPosition | null;

  @ApiProperty({
    enum: AffiliationStatus,
    enumName: 'AffiliationStatus',
    example: AffiliationStatus.ACTIVE,
  })
  status!: AffiliationStatus;

  @ApiPropertyOptional({
    example: '2026-08-15T12:00:00.000Z',
    nullable: true,
  })
  inviteExpiresAt!: Date | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  createdByUserId!: number | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-02T12:00:00.000Z' })
  updatedAt!: Date;
}
