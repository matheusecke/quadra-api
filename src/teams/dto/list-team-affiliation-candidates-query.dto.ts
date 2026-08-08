import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListTeamAffiliationCandidatesQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ example: 'aguias' })
  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) => {
    const value: unknown = params.value;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  q?: string;
}
