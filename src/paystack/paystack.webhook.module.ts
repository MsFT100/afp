import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaystackWebhookController } from './paystack.webhook.controller';
import { PaystackWebhookService } from './paystack.webhook.service';
import { PaystackService } from './paystack.service';
import { WalletsService } from '../wallet/wallet.service';
import { TransactionsService } from '../transactions/transactions.service';
import { Wallet } from '../wallet/wallet.entity';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { PayPalModule } from '../paypal/paypal.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Wallet, Transaction]), PayPalModule],
  controllers: [PaystackWebhookController],
  providers: [PaystackWebhookService, PaystackService, WalletsService, TransactionsService],
  exports: [PaystackWebhookService],
})
export class PaystackWebhookModule {}