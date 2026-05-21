import { Module } from '@nestjs/common';
import { PaystackWebhookController } from './paystack.webhook.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [PaystackWebhookController],
  providers: [],
})
export class PaystackWebhookModule {}