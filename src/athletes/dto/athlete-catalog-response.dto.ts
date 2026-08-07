import { ApiProperty } from '@nestjs/swagger';
import { BasketballPosition, EntityStatus, RosterRole } from '@prisma/client';

export class AthleteCatalogResponseDto {
  @ApiProperty({ example: 165, description: 'Global User.id.' })
  id!: number;

  @ApiProperty({ example: 'Rafael Moura' })
  name!: string;

  @ApiProperty({ example: 8 })
  teamId!: number;

  @ApiProperty({ enum: RosterRole, enumName: 'RosterRole' })
  role!: RosterRole;

  @ApiProperty({ example: 7, nullable: true })
  jerseyNumber!: number | null;

  @ApiProperty({
    enum: BasketballPosition,
    enumName: 'BasketballPosition',
    nullable: true,
  })
  position!: BasketballPosition | null;

  @ApiProperty({
    enum: EntityStatus,
    enumName: 'EntityStatus',
    example: EntityStatus.ACTIVE,
  })
  status!: EntityStatus;
}
