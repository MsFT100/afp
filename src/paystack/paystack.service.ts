import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaystackService {
  private readonly PAYSTACK_SECRET: string;

  constructor(private configService: ConfigService) {
    this.PAYSTACK_SECRET = this.configService.get<string>('PAYSTACK_SECRET_KEY')!;
    if (!this.PAYSTACK_SECRET) {
      throw new InternalServerErrorException('Paystack API credentials are not configured.');
    }
  }

  async initializeTransaction(email: string, amount: number, callbackUrl: string, currency: string = 'NGN'): Promise<any> {
    const amountInSmallestUnit = currency === 'KES' ? Math.round(amount * 100) : amount * 100;

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountInSmallestUnit,
        currency,
        callback_url: callbackUrl,
      }),
    });
    return response.json();
  }

  async verifyTransaction(reference: string): Promise<any> {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
      },
    });
    return response.json();
  }
}