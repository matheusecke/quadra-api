import { ApiProperty } from '@nestjs/swagger';

export class MyProfileResponseDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Read-only here; changing it is a platform-admin operation.',
  })
  email!: string;

  @ApiProperty({ example: 'User Name' })
  name!: string;

  @ApiProperty({
    example: '1998-04-23',
    description: 'Date-only string in YYYY-MM-DD format.',
  })
  birthDate!: string;

  @ApiProperty({
    example: 182,
    nullable: true,
    description: 'Height in centimeters, or null when never informed.',
  })
  heightCm!: number | null;
}
