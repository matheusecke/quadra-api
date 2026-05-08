import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliationStatus, OrgRole } from '@prisma/client';

export class UserAffiliationResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() userId: number;
  @ApiProperty() organizationId: number;
  @ApiProperty({ enum: OrgRole }) role: OrgRole;
  @ApiPropertyOptional() teamId: number | null;
  @ApiPropertyOptional() jerseyNumber: number | null;
  @ApiProperty({ enum: AffiliationStatus }) status: AffiliationStatus;
  @ApiPropertyOptional() createdByUserId: number | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
