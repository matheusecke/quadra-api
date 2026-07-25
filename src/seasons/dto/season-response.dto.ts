import { ApiProperty } from '@nestjs/swagger';
import { SeasonStatus } from '@prisma/client';

export class SeasonResponseDto {
  @ApiProperty({ example: 3 })
  id!: number;

  @ApiProperty({ example: '2025/26' })
  label!: string;

  @ApiProperty({
    example: '2025-08-01',
    description: 'Calendar date, YYYY-MM-DD.',
  })
  startDate!: string;

  @ApiProperty({
    example: '2026-07-31',
    description: 'Calendar date, YYYY-MM-DD.',
  })
  endDate!: string;

  @ApiProperty({
    enum: SeasonStatus,
    enumName: 'SeasonStatus',
    example: SeasonStatus.ACTIVE,
  })
  status!: SeasonStatus;

  @ApiProperty({ example: '2026-07-20T14:03:11.482Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-24T09:12:00.145Z' })
  updatedAt!: Date;
}
