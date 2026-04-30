import { ApiProperty } from '@nestjs/swagger';
import { OrgAffiliationDto } from './org-affiliation.dto';

export class LoginUserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isSystemAdmin: boolean;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ type: LoginUserDto })
  user: LoginUserDto;

  @ApiProperty({ type: [OrgAffiliationDto] })
  organizations: OrgAffiliationDto[];
}
