import { Module } from '@nestjs/common';
import { PaystackWebhookController } from './paystack.webhook.controller';
import { PaystackWebhookService } from './paystack.webhook.service';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PaystackModule } from './paystack.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    WalletModule,
    TransactionsModule,
    PaystackModule,
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [PaystackWebhookController],
  providers: [PaystackWebhookService],
})
export class PaystackWebhookModule {}
