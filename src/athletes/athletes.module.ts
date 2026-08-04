import { Module } from '@nestjs/common';
import { StatisticsModule } from '../statistics/statistics.module';
import { AthletesController } from './athletes.controller';
import { AthletesService } from './athletes.service';

@Module({
  imports: [StatisticsModule],
  controllers: [AthletesController],
  providers: [AthletesService],
  exports: [AthletesService],
})
export class AthletesModule {}
