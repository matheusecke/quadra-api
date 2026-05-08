import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { OrgRole } from '@prisma/client';

export class CreateUserAffiliationDto {
  @ApiProperty() @IsInt() @IsPositive() userId: number;
  @ApiProperty({ enum: OrgRole }) @IsEnum(OrgRole) role: OrgRole;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() teamId?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 99 })
  @IsOptional() @IsInt() @Min(0) @Max(99) jerseyNumber?: number;
}
