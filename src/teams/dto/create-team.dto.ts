import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTeamDto {
  @ApiProperty({ example: 'São Paulo FC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    example: 'SPF',
    description: 'Short display sigla for the team.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  shortName: string;
}
