import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { AffiliationStatus, OrgRole } from '@prisma/client';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListUserAffiliationsQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ enum: AffiliationStatus }) @IsOptional() @IsEnum(AffiliationStatus) status?: AffiliationStatus;
  @ApiPropertyOptional({ enum: OrgRole }) @IsOptional() @IsEnum(OrgRole) role?: OrgRole;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) teamId?: number;
}
