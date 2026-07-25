import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateTournamentCategoryDto {
  @ApiPropertyOptional({ example: 'Sub-17 Masculino' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({
    example: 4,
    nullable: true,
    description: 'Send null to clear the manual ordering.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number | null;
}
