import { ApiProperty } from '@nestjs/swagger';
import { OrgAffiliationDto } from './org-affiliation.dto';

export class LoginUserDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'User Name' })
  name!: string;

  @ApiProperty({ example: false })
  isSystemAdmin!: boolean;
}

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token for Authorization: Bearer.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({ type: LoginUserDto })
  user!: LoginUserDto;

  @ApiProperty({
    type: [OrgAffiliationDto],
    description:
      'Active organization affiliations for this user (may be empty).',
  })
  organizations!: OrgAffiliationDto[];
}
