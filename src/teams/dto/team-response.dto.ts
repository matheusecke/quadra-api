import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';

export class TeamResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'São Paulo FC' })
  name!: string;

  @ApiProperty({ example: 'sao-paulo-fc' })
  slug!: string;

  @ApiProperty({
    enum: EntityStatus,
    enumName: 'EntityStatus',
    example: EntityStatus.ACTIVE,
  })
  status!: EntityStatus;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-02T12:00:00.000Z' })
  updatedAt!: Date;
}
