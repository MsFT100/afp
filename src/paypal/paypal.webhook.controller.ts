import { Controller, Post, Headers, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PayPalWebhookService } from './paypal.webhook.service';

@Controller('paypal')
export class PayPalWebhookController {
  constructor(private readonly payPalWebhookService: PayPalWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers() headers: any,
    @Body() payload: any,
  ) {
    await this.payPalWebhookService.handleWebhook(headers, payload);
    return { received: true };
  }
}