import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentSecret1', description: 'Existing password.' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    example: 'newSecret456',
    minLength: 8,
    description: 'New password (minimum 8 characters).',
  })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
