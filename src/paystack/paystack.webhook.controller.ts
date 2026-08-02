import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaystackWebhookService } from './paystack.webhook.service';
import * as crypto from 'crypto';

@Controller('payment')
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    private readonly webhookService: PaystackWebhookService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Req() req: any,
    @Body() body: any,
    @Headers('x-paystack-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing Paystack signature');
    }

    // Paystack signs the raw request body. Use req.rawBody (set in main.ts)
    // and fall back to a re-serialization of the parsed body.
    const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(body);

    if (!this.verifySignature(signature, rawBody)) {
      this.logger.error('Invalid Paystack webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    await this.webhookService.handlePaymentWebhook(body);

    // Always return 200 so Paystack does not retry
    return { status: 'success' };
  }

  private verifySignature(signature: string, rawBody: string): boolean {
    // Prefer the dedicated webhook secret, but fall back to the secret key
    // for backward compatibility with the previous configuration.
    const secrets = [
      this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET'),
      this.configService.get<string>('PAYSTACK_SECRET_KEY'),
    ].filter((s): s is string => !!s);

    return secrets.some((secret) => {
      const hash = crypto
        .createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');
      return hash === signature;
    });
  }
}
