import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AffiliationStatus } from '@prisma/client';

export class UpdateTeamAffiliationStatusDto {
  @ApiProperty({ enum: AffiliationStatus })
  @IsEnum(AffiliationStatus)
  status: AffiliationStatus;
}
