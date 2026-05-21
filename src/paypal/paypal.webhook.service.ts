import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WalletsService } from '../wallet/wallet.service';
import { PayPalService } from './paypal.service';
import { TransactionType } from '../transactions/transaction.entity';

@Injectable()
export class PayPalWebhookService {
  private readonly logger = new Logger(PayPalWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly walletsService: WalletsService,
    private readonly paypalService: PayPalService,
  ) {}

  async handleWebhook(headers: Record<string, string>, body: any) {
    const isVerified = await this.verifySignature(headers, body);

    if (!isVerified) {
      this.logger.error('PayPal Webhook signature verification failed');
      throw new BadRequestException('Invalid signature');
    }

    this.logger.log(`Received PayPal event: ${body.event_type}`);

    // Handle successful capture
    if (body.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = body.resource.supplementary_data?.related_ids?.order_id || body.resource.parent_payment;
      const amount = parseFloat(body.resource.amount.value);
      
      // Find the transaction by reference (orderId)
      const transaction = await this.walletsService.transactionsService.transactionsRepository.findOne({
        where: { reference: orderId },
        relations: ['user'],
      });

      if (transaction && transaction.user) {
        await this.walletsService.creditUserWalletFromWebhook(
          transaction.user.id,
          amount,
          orderId,
          TransactionType.PAYPAL_DEPOSIT,
        );
      }
    }
  }

  private async verifySignature(headers: Record<string, string>, body: any): Promise<boolean> {
    const webhookId = this.configService.get<string>('PAYPAL_WEBHOOK_ID');
    const accessToken = await this.paypalService.generateAccessToken();
    
    const verificationBody = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: body,
    };

    try {
      const endpoint = this.configService.get<string>('NODE_ENV') === 'production'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

      const response = await firstValueFrom(
        this.httpService.post(`${endpoint}/v1/notifications/verify-webhook-signature`, verificationBody, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      );
      return response.data.verification_status === 'SUCCESS';
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Error verifying PayPal webhook', error.message, error.stack);
      } else {
        this.logger.error('Unknown error verifying PayPal webhook', error);
      }
      return false;
    }
  }
}