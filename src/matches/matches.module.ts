import { Module } from '@nestjs/common';
import {
  MatchesByTournamentController,
  MatchesController,
} from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  controllers: [MatchesController, MatchesByTournamentController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
