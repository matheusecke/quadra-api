import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';

export class TeamResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ enum: EntityStatus }) status: EntityStatus;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
