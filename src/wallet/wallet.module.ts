import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsService } from './wallet.service';
import { WalletsController } from './wallet.controller';
import { Wallet } from './wallet.entity';
import { User } from '../users/user.entity';
import { CurrencyPair } from '../currency/currency-pair.entity';
import { CurrencyPairsModule } from '../currency/currency-pairs.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PaystackModule } from '../paystack/paystack.module';
import { PayPalModule } from '../paypal/paypal.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, User, CurrencyPair]),
    CurrencyPairsModule,
    TransactionsModule,
    PaystackModule,
    PayPalModule,
  ],
  providers: [WalletsService],
  controllers: [WalletsController],
  exports: [WalletsService],
})
export class WalletModule {}