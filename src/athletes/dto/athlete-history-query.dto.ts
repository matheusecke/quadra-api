import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

const repeatedIds = ({ value }: { value: unknown }): unknown =>
  (Array.isArray(value) ? value : [value]).map((item) => Number(item));

export class ListAthleteMatchesQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({
    type: [Number],
    example: [501, 498],
    description: 'Repeat the param: ?ids=501&ids=498',
  })
  @IsOptional()
  @Transform(repeatedIds)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tournamentId?: number;
}

export class ListAthleteTournamentsQueryDto extends PaginationDefaultsDto {
  @ApiPropertyOptional({
    type: [Number],
    example: [12, 9],
    description: 'Repeat the param: ?ids=12&ids=9',
  })
  @IsOptional()
  @Transform(repeatedIds)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seasonId?: number;
}
