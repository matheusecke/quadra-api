import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AffiliationStatus } from '@prisma/client';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export class ListTeamAffiliationsQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ enum: AffiliationStatus })
  @IsOptional()
  @IsEnum(AffiliationStatus)
  status?: AffiliationStatus;
}
