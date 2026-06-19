import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class ListUserOrgsQueryDto {
  @ApiPropertyOptional({
    example: 'São Paulo',
    description: 'Filters organizations by name using case-insensitive search.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  name?: string;
}
