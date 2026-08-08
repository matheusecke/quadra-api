import { ApiPropertyOptional } from '@nestjs/swagger';
import { BasketballPosition } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateUserAffiliationDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 99, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number | null;

  @ApiPropertyOptional({ enum: BasketballPosition, nullable: true })
  @IsOptional()
  @IsEnum(BasketballPosition)
  position?: BasketballPosition | null;
}
