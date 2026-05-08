import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateOrganizationStatusDto {
  @ApiProperty({ enum: EntityStatus })
  @IsEnum(EntityStatus)
  status: EntityStatus;
}
