import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateTournamentRosterDto {
  @ApiProperty({ example: 165, description: 'Global User.id.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiProperty({ example: 41, description: 'TournamentTeam.id.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentTeamId!: number;

  @ApiProperty({ enum: RosterRole, enumName: 'RosterRole' })
  @IsEnum(RosterRole)
  role!: RosterRole;

  @ApiPropertyOptional({ example: 7, nullable: true, minimum: 0, maximum: 99 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number | null;
}
