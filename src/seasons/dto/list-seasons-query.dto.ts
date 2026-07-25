import { ApiPropertyOptional } from '@nestjs/swagger';
import { SeasonStatus } from '@prisma/client';
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

export class ListSeasonsQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ example: '2025' })
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
    example: [3, 7],
    description: 'Repeat the param: ?ids=3&ids=7',
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((item) => Number(item)),
  )
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @ApiPropertyOptional({ enum: SeasonStatus, enumName: 'SeasonStatus' })
  @IsOptional()
  @IsEnum(SeasonStatus)
  status?: SeasonStatus;
}
