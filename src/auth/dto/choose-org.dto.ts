import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class ChooseOrgDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  organizationId: number;
}
