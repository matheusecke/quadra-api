import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliationStatus } from '@prisma/client';

export class TeamAffiliationResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() organizationId: number;
  @ApiProperty() teamId: number;
  @ApiProperty({ enum: AffiliationStatus }) status: AffiliationStatus;
  @ApiPropertyOptional() createdByUserId: number | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
