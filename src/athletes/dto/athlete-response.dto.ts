import { ApiProperty } from '@nestjs/swagger';
import { BasketballPosition, EntityStatus } from '@prisma/client';

export class AthleteProfileResponseDto {
  @ApiProperty({ example: 165 }) id!: number;
  @ApiProperty({ example: 'Rafael Moura' }) name!: string;
  @ApiProperty({ example: 8, nullable: true }) currentTeamId!: number | null;
  @ApiProperty({ example: 7, nullable: true }) jerseyNumber!: number | null;
  @ApiProperty({ enum: BasketballPosition, nullable: true })
  position!: BasketballPosition | null;
  @ApiProperty({ enum: EntityStatus, enumName: 'EntityStatus' })
  status!: EntityStatus;
}
