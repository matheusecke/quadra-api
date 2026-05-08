import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { AffiliationStatus } from '@prisma/client';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListTeamAffiliationsQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ enum: AffiliationStatus })
  @IsOptional()
  @IsEnum(AffiliationStatus)
  status?: AffiliationStatus;

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
