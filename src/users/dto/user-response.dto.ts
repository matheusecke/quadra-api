import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'john@example.com' })
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({
    enum: EntityStatus,
    enumName: 'EntityStatus',
    example: EntityStatus.ACTIVE,
  })
  status!: EntityStatus;

  @ApiProperty({ example: false })
  isSystemAdmin!: boolean;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-02T12:00:00.000Z' })
  updatedAt!: Date;
}
