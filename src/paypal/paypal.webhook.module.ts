import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayPalWebhookController } from './paypal.webhook.controller';
import { PayPalWebhookService } from './paypal.webhook.service';
import { PayPalModule } from './paypal.module';
import { WalletsService } from '../wallet/wallet.service';
import { TransactionsService } from '../transactions/transactions.service';
import { User } from '../users/user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { Transaction } from '../transactions/transaction.entity';
import { PaystackModule } from '../paystack/paystack.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Wallet, Transaction]), PayPalModule, PaystackModule],
  controllers: [PayPalWebhookController],
  providers: [PayPalWebhookService, WalletsService, TransactionsService],
})
export class PayPalWebhookModule {}