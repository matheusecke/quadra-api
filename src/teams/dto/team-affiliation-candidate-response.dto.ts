import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliationStatus, BrazilianState } from '@prisma/client';

export class TeamAffiliationCandidateLinkDto {
  @ApiProperty({ example: 15 })
  id!: number;

  @ApiProperty({ enum: [AffiliationStatus.INACTIVE] })
  status!: Extract<AffiliationStatus, 'INACTIVE'>;
}

export class TeamAffiliationCandidateResponseDto {
  @ApiProperty({ example: 8 })
  id!: number;

  @ApiProperty({ example: 'Águias Campinas' })
  name!: string;

  @ApiProperty({ example: 'AGC' })
  shortName!: string;

  @ApiPropertyOptional({ example: 'Campinas', nullable: true })
  city!: string | null;

  @ApiPropertyOptional({ enum: BrazilianState, nullable: true })
  state!: BrazilianState | null;

  @ApiPropertyOptional({
    type: TeamAffiliationCandidateLinkDto,
    nullable: true,
  })
  affiliation!: TeamAffiliationCandidateLinkDto | null;
}
