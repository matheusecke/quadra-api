import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';

export class TournamentCategoryResponseDto {
  @ApiProperty({ example: 2 })
  id!: number;

  @ApiProperty({ example: 'Adulto Masculino' })
  name!: string;

  @ApiProperty({ example: 'adulto-masculino', nullable: true })
  slug!: string | null;

  @ApiProperty({ example: 2, nullable: true })
  sortOrder!: number | null;

  @ApiProperty({
    enum: EntityStatus,
    enumName: 'EntityStatus',
    example: EntityStatus.ACTIVE,
  })
  status!: EntityStatus;

  @ApiProperty({ example: '2026-07-20T14:05:52.771Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-20T14:05:52.771Z' })
  updatedAt!: Date;
}
