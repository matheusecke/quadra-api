import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AffiliationStatus, OrgRole } from '@prisma/client';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListUserAffiliationsQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ enum: AffiliationStatus })
  @IsOptional()
  @IsEnum(AffiliationStatus)
  status?: AffiliationStatus;
  @ApiPropertyOptional({ enum: OrgRole })
  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  teamId?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  inviteExpired?: boolean;
}
