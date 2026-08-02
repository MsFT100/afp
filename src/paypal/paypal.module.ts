import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PayPalService } from './paypal.service';

@Module({
  imports: [ConfigModule],
  providers: [PayPalService],
  exports: [PayPalService],
})
export class PayPalModule {}
