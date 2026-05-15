import * as common from '@nestjs/common';
import { Request } from 'express';
import { PaystackWebhookService } from './paystack.webhook.service';

@common.Controller('paystack')
export class PaystackWebhookController {
  private readonly logger = new common.Logger(PaystackWebhookController.name);

  constructor(private readonly paystackWebhookService: PaystackWebhookService) {}

  @common.Post('webhook')
  async handleWebhook(
    @common.Headers('x-paystack-signature') signature: string,
    @common.Req() req: common.RawBodyRequest<Request>,
  ): Promise<string> {
    if (!signature) {
      this.logger.warn('Paystack webhook received without signature header.');
      throw new common.InternalServerErrorException('Webhook signature missing.');
    }

    // req.rawBody contains the raw request body, crucial for signature verification
    const rawBody = req.rawBody?.toString();
    if (!rawBody) {
      this.logger.error('Paystack webhook received with empty raw body.');
      throw new common.InternalServerErrorException('Empty raw body received for webhook.');
    }

    const isVerified = this.paystackWebhookService.verifySignature(signature, JSON.parse(rawBody));
    if (!isVerified) {
      this.logger.error('Paystack webhook signature verification failed.');
      throw new common.InternalServerErrorException('Webhook signature verification failed.');
    }

    await this.paystackWebhookService.handlePaymentWebhook(JSON.parse(rawBody));
    return 'Webhook received and processed successfully';
  }
}