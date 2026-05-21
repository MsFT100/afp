import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { WalletsService } from '../wallet/wallet.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Controller('payment')
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    private readonly walletsService: WalletsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Body() body: any,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    
    if (!secret) {
      this.logger.error('PAYSTACK_SECRET_KEY is not defined');
      throw new BadRequestException('Configuration error');
    }

    // Verify the signature to ensure the request is genuinely from Paystack
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (hash !== signature) {
      this.logger.error('Invalid Paystack webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    if (body.event === 'charge.success') {
      const { reference, amount } = body.data;
      
      // Find the pending transaction to get the user ID
      const transaction = await this.walletsService.transactionsService.transactionsRepository.findOne({
        where: { reference },
        relations: ['user'],
      });

      if (transaction && transaction.user) {
        const amountInMainUnit = amount / 100; // Paystack sends amount in Kobo
        await this.walletsService.creditUserWalletFromWebhook(transaction.user.id, amountInMainUnit, reference);
        this.logger.log(`Successfully processed webhook for reference: ${reference}`);
      }
    }

    return { status: 'success' };
  }
}