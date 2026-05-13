import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus, OrgRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListUsersQueryDto extends PaginationDefaultsDto {
  @ApiProperty({ example: 'john', required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  q?: string;

  @ApiProperty({ enum: EntityStatus, required: false })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  organizationId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamId?: number;

  @ApiProperty({ enum: OrgRole, required: false })
  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isSystemAdmin?: boolean;
}
