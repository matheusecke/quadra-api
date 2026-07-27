import { Module } from '@nestjs/common';
import {
  TournamentGroupTeamsController,
  TournamentGroupsByTournamentController,
  TournamentGroupsController,
} from './tournament-groups.controller';
import { TournamentGroupsService } from './tournament-groups.service';

@Module({
  controllers: [
    TournamentGroupsByTournamentController,
    TournamentGroupsController,
    TournamentGroupTeamsController,
  ],
  providers: [TournamentGroupsService],
  exports: [TournamentGroupsService],
})
export class TournamentGroupsModule {}
