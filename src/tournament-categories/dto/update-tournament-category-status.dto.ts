import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTournamentCategoryStatusDto {
  @ApiProperty({ enum: EntityStatus, enumName: 'EntityStatus' })
  @IsEnum(EntityStatus)
  status: EntityStatus;
}
