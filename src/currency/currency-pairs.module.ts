import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { CurrencyPairsService } from './currency-pairs.service';
import { CurrencyPairsController } from './currency-pairs.controller';
import { CurrencyPair } from './currency-pair.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CurrencyPair]),
    HttpModule,
    ScheduleModule.forRoot(),
  ],
  providers: [CurrencyPairsService],
  controllers: [CurrencyPairsController],
})
export class CurrencyPairsModule {}