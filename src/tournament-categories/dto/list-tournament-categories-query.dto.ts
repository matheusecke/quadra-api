import { ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListTournamentCategoriesQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ example: 'Sub' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  q?: string;

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2],
    description: 'Repeat the param: ?ids=1&ids=2',
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((item) => Number(item)),
  )
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @ApiPropertyOptional({ enum: EntityStatus, enumName: 'EntityStatus' })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
