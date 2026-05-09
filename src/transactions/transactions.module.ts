import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction])],
  providers: [TransactionsService],
  exports: [TransactionsService], // Export the service so WalletsService can use it
})
export class TransactionsModule {}
