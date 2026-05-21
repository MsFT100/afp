import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { PayPalWebhookService } from './paypal.webhook.service';

@Controller('paypal')
export class PayPalWebhookController {
  constructor(private readonly paypalWebhookService: PayPalWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    // We return 200 OK immediately to PayPal and process logic
    await this.paypalWebhookService.handleWebhook(headers, body);
    return { received: true };
  }
}