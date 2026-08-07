import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { Transform, type TransformFnParams, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListAthletesQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ example: 'rafael' })
  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) => {
    const value: unknown = params.value;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  q?: string;

  @ApiPropertyOptional({
    type: [Number],
    example: [165, 166],
    description: 'Repeat the param: ?ids=165&ids=166',
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((item) => Number(item)),
  )
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamId?: number;

  @ApiPropertyOptional({
    enum: [OrgRole.ATHLETE, OrgRole.COACHING_STAFF],
  })
  @IsOptional()
  @IsIn([OrgRole.ATHLETE, OrgRole.COACHING_STAFF])
  role?: typeof OrgRole.ATHLETE | typeof OrgRole.COACHING_STAFF;
}
