import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrgRole } from '@prisma/client';

export class UpdateUserAffiliationDto {
  @ApiPropertyOptional({ enum: OrgRole })
  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;
  @ApiPropertyOptional() @IsOptional() @IsInt() teamId?: number | null;
  @ApiPropertyOptional({ minimum: 0, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number | null;
}
