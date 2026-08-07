import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PaginationDefaultsDto } from '../../common/dto/pagination-defaults.dto';

export const TEAM_MATCH_SCOPES = ['upcoming', 'history'] as const;
export type TeamMatchScope = (typeof TEAM_MATCH_SCOPES)[number];

export class TeamMatchesQueryDto extends PaginationDefaultsDto {
  @ApiProperty({ enum: TEAM_MATCH_SCOPES, example: 'upcoming' })
  @IsIn(TEAM_MATCH_SCOPES)
  scope!: TeamMatchScope;
}

export class TeamTournamentsQueryDto extends PaginationDefaultsDto {}
