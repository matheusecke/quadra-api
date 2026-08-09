import { ApiProperty } from '@nestjs/swagger';

export class TeamAdminInviteDeliveryDto {
  @ApiProperty({ example: 91 })
  affiliationId!: number;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  inviteToken!: string;

  @ApiProperty({ example: '2026-08-15T12:00:00.000Z' })
  inviteExpiresAt!: Date;
}

export class TeamAdminInvitesBundleDto {
  @ApiProperty({ type: [TeamAdminInviteDeliveryDto] })
  invites!: TeamAdminInviteDeliveryDto[];
}
