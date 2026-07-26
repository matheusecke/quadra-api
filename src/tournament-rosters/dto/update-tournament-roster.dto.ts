import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { RosterRole } from '@prisma/client';

export class UpdateTournamentRosterDto {
  @ApiPropertyOptional({ enum: RosterRole, enumName: 'RosterRole' })
  @IsOptional()
  @IsEnum(RosterRole)
  role?: RosterRole;

  @ApiPropertyOptional({ example: 23, nullable: true, minimum: 0, maximum: 99 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number | null;
}
