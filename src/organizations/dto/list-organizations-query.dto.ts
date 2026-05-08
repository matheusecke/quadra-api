import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListOrganizationsQueryDto extends PaginationDefaultsDto {
  @ApiProperty({ example: 'São Paulo', required: false })
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
}
