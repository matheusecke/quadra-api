import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { InviteDecision } from '../../organization-user-affiliations/dto/user-invite-response.dto';

export class RespondToMyInviteDto {
  @ApiProperty({ enum: InviteDecision })
  @IsEnum(InviteDecision)
  decision!: InviteDecision;
}
