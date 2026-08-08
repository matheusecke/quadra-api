import { ApiProperty } from '@nestjs/swagger';

export class UserLookupResponseDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: 'Marina Souza' })
  name!: string;

  @ApiProperty({ example: 'marina@example.com' })
  email!: string;
}
