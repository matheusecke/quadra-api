import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTeamStatusDto {
  @ApiProperty({ enum: EntityStatus })
  @IsEnum(EntityStatus)
  status: EntityStatus;
}
