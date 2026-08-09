import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BasketballPosition, OrgRole } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  Max,
  Min,
} from 'class-validator';

export class CreateTeamMemberAffiliationDto {
  @ApiProperty({ example: 42 }) @IsInt() @IsPositive() userId!: number;

  @ApiProperty({ enum: [OrgRole.ATHLETE, OrgRole.COACHING_STAFF] })
  @IsIn([OrgRole.ATHLETE, OrgRole.COACHING_STAFF])
  role!: Extract<OrgRole, 'ATHLETE' | 'COACHING_STAFF'>;

  @ApiPropertyOptional({ minimum: 0, maximum: 99, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number | null;

  @ApiPropertyOptional({ enum: BasketballPosition, nullable: true })
  @IsOptional()
  @IsEnum(BasketballPosition)
  position?: BasketballPosition | null;
}
