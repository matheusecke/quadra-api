import { ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentTeamStatus } from '@prisma/client';
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

export class ListTournamentTeamsQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({ example: 'engenharia' })
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
    example: [41, 42],
    description: 'Repeat the param: ?ids=41&ids=42',
  })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((item) => Number(item)),
  )
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @ApiPropertyOptional({
    enum: TournamentTeamStatus,
    enumName: 'TournamentTeamStatus',
  })
  @IsOptional()
  @IsEnum(TournamentTeamStatus)
  status?: TournamentTeamStatus;
}
