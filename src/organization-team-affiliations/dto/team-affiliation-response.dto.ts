import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliationStatus, BrazilianState } from '@prisma/client';

export class AffiliationTeamDto {
  @ApiProperty({ example: 3 })
  id!: number;

  @ApiProperty({ example: 'Equipe A' })
  name!: string;

  @ApiProperty({ example: 'AGC' })
  shortName!: string;

  @ApiPropertyOptional({ example: 'Campinas', nullable: true })
  city!: string | null;

  @ApiPropertyOptional({ enum: BrazilianState, nullable: true })
  state!: BrazilianState | null;
}

export class TeamAffiliationResponseDto {
  @ApiProperty({ example: 5 })
  id!: number;

  @ApiProperty({ example: 1 })
  organizationId!: number;

  @ApiProperty({ example: 3 })
  teamId!: number;

  @ApiProperty({ type: () => AffiliationTeamDto })
  team!: AffiliationTeamDto;

  @ApiProperty({
    enum: AffiliationStatus,
    enumName: 'AffiliationStatus',
    example: AffiliationStatus.PENDING,
  })
  status!: AffiliationStatus;

  @ApiPropertyOptional({ example: 1, nullable: true })
  createdByUserId!: number | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-02T12:00:00.000Z' })
  updatedAt!: Date;
}
