import { Module } from '@nestjs/common';
import {
  TournamentRostersByTeamController,
  TournamentRostersController,
} from './tournament-rosters.controller';
import { TournamentRostersService } from './tournament-rosters.service';

@Module({
  controllers: [TournamentRostersByTeamController, TournamentRostersController],
  providers: [TournamentRostersService],
  exports: [TournamentRostersService],
})
export class TournamentRostersModule {}
