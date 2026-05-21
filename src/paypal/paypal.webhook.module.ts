import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PayPalWebhookController } from './paypal.webhook.controller';
import { PayPalWebhookService } from './paypal.webhook.service';
import { WalletModule } from '../wallet/wallet.module';
import { PayPalModule } from './paypal.module';

@Module({
  imports: [HttpModule, WalletModule, PayPalModule],
  controllers: [PayPalWebhookController],
  providers: [PayPalWebhookService],
  exports: [PayPalWebhookService],
})
export class PayPalWebhookModule {}