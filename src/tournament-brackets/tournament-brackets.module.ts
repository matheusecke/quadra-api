import { Module } from '@nestjs/common';
import {
  TournamentBracketByTournamentController,
  TournamentBracketRoundsController,
  TournamentBracketSlotsController,
} from './tournament-brackets.controller';
import { TournamentBracketsService } from './tournament-brackets.service';

@Module({
  controllers: [
    TournamentBracketByTournamentController,
    TournamentBracketRoundsController,
    TournamentBracketSlotsController,
  ],
  providers: [TournamentBracketsService],
  exports: [TournamentBracketsService],
})
export class TournamentBracketsModule {}
