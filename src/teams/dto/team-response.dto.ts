import { ApiProperty } from '@nestjs/swagger';
import { BrazilianState, EntityStatus } from '@prisma/client';

export class TeamResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'São Paulo FC' })
  name!: string;

  @ApiProperty({ example: 'SPF' })
  shortName!: string;

  @ApiProperty({ example: 'sao-paulo-fc' })
  slug!: string;

  @ApiProperty({ example: 'Campinas', nullable: true })
  city!: string | null;

  @ApiProperty({
    enum: BrazilianState,
    enumName: 'BrazilianState',
    nullable: true,
  })
  state!: BrazilianState | null;

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
