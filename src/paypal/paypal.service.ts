import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fetch from 'node-fetch';

@Injectable()
export class PayPalService {
  private readonly PAYPAL_API_BASE_URL: string;
  private readonly PAYPAL_CLIENT_ID: string;
  private readonly PAYPAL_CLIENT_SECRET: string;

  constructor(private configService: ConfigService) {
    this.PAYPAL_API_BASE_URL = this.configService.get<string>('PAYPAL_API_BASE_URL', 'https://api-m.sandbox.paypal.com'); // Default to sandbox
    this.PAYPAL_CLIENT_ID = this.configService.get<string>('PAYPAL_CLIENT_ID')!;
    this.PAYPAL_CLIENT_SECRET = this.configService.get<string>('PAYPAL_CLIENT_SECRET')!;

    if (!this.PAYPAL_CLIENT_ID || !this.PAYPAL_CLIENT_SECRET) {
      throw new InternalServerErrorException('PayPal API credentials are not configured.');
    }
  }

  public async generateAccessToken(): Promise<string> {
    const auth = Buffer.from(`${this.PAYPAL_CLIENT_ID}:${this.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const response = await fetch(`${this.PAYPAL_API_BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new InternalServerErrorException(`Failed to generate PayPal access token: ${JSON.stringify(errorData)}`);
    }

    const data: any = await response.json();
    return data.access_token;
  }

  async createOrder(amount: number, currency: string = 'USD'): Promise<any> {
    const accessToken = await this.generateAccessToken();
    const response = await fetch(`${this.PAYPAL_API_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
          },
        ],
        application_context: {
          return_url: this.configService.get<string>('PAYPAL_RETURN_URL'),
          cancel_url: this.configService.get<string>('PAYPAL_CANCEL_URL'),
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new InternalServerErrorException(`Failed to create PayPal order: ${JSON.stringify(errorData)}`);
    }

    return response.json();
  }

  async captureOrder(orderId: string): Promise<any> {
    const accessToken = await this.generateAccessToken();
    const response = await fetch(`${this.PAYPAL_API_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new InternalServerErrorException(`Failed to capture PayPal order: ${JSON.stringify(errorData)}`);
    }

    return response.json();
  }

  async verifyWebhookSignature(headers: any, body: any): Promise<boolean> {
    const accessToken = await this.generateAccessToken();
    const webhookId = this.configService.get<string>('PAYPAL_WEBHOOK_ID');

    const response = await fetch(`${this.PAYPAL_API_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        transmission_id: headers['paypal-transmission-id'],
        transmission_time: headers['paypal-transmission-time'],
        cert_url: headers['paypal-cert-url'],
        auth_algo: headers['paypal-auth-algo'],
        transmission_sig: headers['paypal-transmission-sig'],
        webhook_id: webhookId,
        webhook_event: body,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data: any = await response.json();
    return data.verification_status === 'SUCCESS';
  }
}