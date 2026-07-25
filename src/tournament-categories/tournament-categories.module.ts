import { Module } from '@nestjs/common';
import { TournamentCategoriesController } from './tournament-categories.controller';
import { TournamentCategoriesService } from './tournament-categories.service';

@Module({
  controllers: [TournamentCategoriesController],
  providers: [TournamentCategoriesService],
  exports: [TournamentCategoriesService],
})
export class TournamentCategoriesModule {}
