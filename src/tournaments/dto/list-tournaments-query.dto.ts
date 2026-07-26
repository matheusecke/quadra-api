import { ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentStatus } from '@prisma/client';
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

export class ListTournamentsQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ example: 'copa' })
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
    example: [12, 15],
    description: 'Repeat the param: ?ids=12&ids=15',
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((item) => Number(item)),
  )
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  seasonId?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({
    enum: TournamentStatus,
    enumName: 'TournamentStatus',
  })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;
}
