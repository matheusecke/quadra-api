// src/users/dto/user-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: EntityStatus }) status: EntityStatus;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
