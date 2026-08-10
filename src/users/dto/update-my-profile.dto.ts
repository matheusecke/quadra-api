import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsBirthDate } from '../../common/validators/is-birth-date.validator';

export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'Matheus Ecke Medeiros' })
  // Not @IsOptional(): that helper also skips validation for an explicit null,
  // and a null name would reach Prisma against a NOT NULL column.
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name?: string;

  @ApiPropertyOptional({
    example: '1998-04-23',
    description: 'Date-only string in YYYY-MM-DD format.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsBirthDate()
  birthDate?: string;

  @ApiPropertyOptional({
    example: 182,
    nullable: true,
    minimum: 50,
    maximum: 250,
    description: 'Height in centimeters. Send null to clear it.',
  })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(250)
  heightCm?: number | null;
}
