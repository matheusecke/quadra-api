import { ApiProperty } from '@nestjs/swagger';

export class ChampionSuggestionResponseDto {
  @ApiProperty({ example: 41, nullable: true })
  championTournamentTeamId!: number | null;
}
