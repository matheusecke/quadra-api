import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email: string;

  @ApiProperty({ example: 'User Name' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'secret123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    name: 'birth_date',
    example: '1998-04-23',
    description: 'Birth date as a date-only string in YYYY-MM-DD format.',
  })
  @Expose({ name: 'birth_date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  birthDate: string;

  @ApiPropertyOptional({
    example: 182,
    nullable: true,
    minimum: 50,
    maximum: 250,
    description: 'Height in centimeters.',
  })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(250)
  height?: number | null;
}
