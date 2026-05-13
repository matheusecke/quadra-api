import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';

export enum InviteDecision {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

export class TeamInviteResponseDto {
  @ApiProperty({ description: 'Invite token received at affiliation creation' })
  @IsString()
  @Length(64, 64)
  token: string;

  @ApiProperty({ enum: InviteDecision })
  @IsEnum(InviteDecision)
  decision: InviteDecision;
}
