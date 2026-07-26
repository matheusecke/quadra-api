import { Module } from '@nestjs/common';
import {
  TournamentTeamsByTournamentController,
  TournamentTeamsController,
} from './tournament-teams.controller';
import { TournamentTeamsService } from './tournament-teams.service';

@Module({
  controllers: [
    TournamentTeamsByTournamentController,
    TournamentTeamsController,
  ],
  providers: [TournamentTeamsService],
  exports: [TournamentTeamsService],
})
export class TournamentTeamsModule {}
