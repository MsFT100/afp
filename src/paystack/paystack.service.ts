import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly PAYSTACK_SECRET: string;
  private readonly PAYSTACK_API_BASE = 'https://api.paystack.co';
  private bankCache: Map<string, any[]> = new Map();
  private bankCacheExpiry = 0;

  constructor(private configService: ConfigService) {
    this.PAYSTACK_SECRET = this.configService.get<string>(
      'PAYSTACK_SECRET_KEY',
    )!;
    if (!this.PAYSTACK_SECRET) {
      throw new InternalServerErrorException(
        'Paystack API credentials are not configured.',
      );
    }
  }

  async initializeTransaction(
    email: string,
    amount: number,
    callbackUrl: string,
    currency: string = 'NGN',
  ): Promise<any> {
    const amountInSmallestUnit = Math.round(amount * 100);

    const response = await fetch(
      `${this.PAYSTACK_API_BASE}/transaction/initialize`,
      {
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
      },
    );
    return response.json();
  }

  async verifyTransaction(reference: string): Promise<any> {
    const response = await fetch(
      `${this.PAYSTACK_API_BASE}/transaction/verify/${reference}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
        },
      },
    );
    return response.json();
  }

  // ==================== WITHDRAWAL / TRANSFER METHODS ====================

  /**
   * Fetches the list of supported banks for a country (e.g. NG, KE, GH, ZA).
   * Results are cached for 24 hours.
   */
  async listBanks(country?: string): Promise<any[]> {
    const cacheKey = country || 'global';
    if (this.bankCache.has(cacheKey) && Date.now() < this.bankCacheExpiry) {
      return this.bankCache.get(cacheKey)!;
    }

    try {
      const url = country
        ? `${this.PAYSTACK_API_BASE}/bank?country=${country}`
        : `${this.PAYSTACK_API_BASE}/bank`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.PAYSTACK_SECRET}` },
      });

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException(data.message || 'Failed to fetch banks');
      }

      this.bankCache.set(cacheKey, data.data);
      this.bankCacheExpiry = Date.now() + 24 * 60 * 60 * 1000;
      return data.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to list banks: ${error?.message}`,
        error?.stack,
      );
      throw new BadRequestException(
        error?.message || 'Failed to fetch bank list',
      );
    }
  }

  /**
   * Validates a bank account number before saving it as a withdrawal destination.
   */
  async resolveAccountNumber(
    accountNumber: string,
    bankCode: string,
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.PAYSTACK_API_BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.PAYSTACK_SECRET}` },
        },
      );

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException(
          data.message || 'Account number not found or invalid',
        );
      }

      return data.data;
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Failed to resolve account',
      );
    }
  }

  /**
   * Creates a transfer recipient in Paystack.
   *
   * type is country-aware:
   * - 'nuban' -> Nigeria
   * - 'ghipss' -> Ghana
   * - 'basa' -> South Africa
   * - 'mobile_money' -> mobile wallets (M-Pesa, MTN MoMo, etc.) with provider + phone
   */
  async createRecipient(
    type: 'nuban' | 'ghipss' | 'basa' | 'mobile_money',
    name: string,
    accountNumber: string,
    bankCode?: string,
    currency: string = 'NGN',
    provider?: string,
  ): Promise<any> {
    if (type === 'mobile_money') {
      if (!provider || !accountNumber) {
        throw new BadRequestException(
          'Mobile money provider and phone number are required',
        );
      }
      if (!/^\d{10,13}$/.test(accountNumber.replace(/[\s-]/g, ''))) {
        throw new BadRequestException('Invalid phone number format');
      }
    } else {
      if (!bankCode) {
        throw new BadRequestException(
          'Bank code is required for this recipient type',
        );
      }
      if (!/^\d{10}$/.test(accountNumber.replace(/[\s-]/g, ''))) {
        throw new BadRequestException('Account number must be 10 digits');
      }
    }

    const payload: any = {
      type,
      name: name.trim(),
      account_number: accountNumber.replace(/[\s-]/g, ''),
      currency,
    };

    if (type === 'mobile_money') {
      payload.mobile_money = {
        provider,
        phone: accountNumber.replace(/[\s-]/g, ''),
      };
      delete payload.account_number;
    } else if (bankCode) {
      payload.bank_code = bankCode;
    }

    try {
      const response = await fetch(
        `${this.PAYSTACK_API_BASE}/transferrecipient`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException(
          data.message ||
            'Failed to create recipient. Please check your bank details.',
        );
      }

      return data.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to create recipient: ${error?.message}`,
        error?.stack,
      );
      throw new BadRequestException(
        error?.message || 'Failed to create recipient',
      );
    }
  }

  /**
   * Initiates a transfer (withdrawal) to a recipient.
   * @param recipientCode Recipient code from createRecipient (data.recipient_code)
   * @param amount Amount in the smallest currency unit (kobo/cents)
   * @param reason Withdrawal reason/description
   * @param reference Our idempotency key; also used to match webhooks
   */
  async initiateTransfer(
    recipientCode: string,
    amount: number,
    reason: string,
    reference?: string,
  ): Promise<any> {
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be greater than 0');
    }

    const payload: any = {
      source: 'balance',
      recipient: recipientCode,
      amount: Math.round(amount),
      reason: reason.substring(0, 255),
    };

    if (reference) {
      payload.reference = reference;
    }

    try {
      const response = await fetch(`${this.PAYSTACK_API_BASE}/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException(
          data.message || 'Failed to initiate transfer',
        );
      }

      return data.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to initiate transfer: ${error?.message}`,
        error?.stack,
      );
      throw new BadRequestException(
        error?.message || 'Failed to initiate transfer',
      );
    }
  }

  /**
   * Verifies the status of a transfer by reference.
   */
  async verifyTransfer(reference: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.PAYSTACK_API_BASE}/transfer/verify/${encodeURIComponent(reference)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.PAYSTACK_SECRET}` },
        },
      );

      const data = await response.json();

      if (!data.status) {
        throw new BadRequestException(
          data.message || 'Transfer verification failed',
        );
      }

      return data.data;
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Failed to verify transfer',
      );
    }
  }

  /**
   * Gets the Paystack transfer fee for a given amount (in the smallest unit).
   */
  async getTransferFee(amount: number): Promise<number> {
    try {
      const response = await fetch(
        `${this.PAYSTACK_API_BASE}/transfer/check?amount=${Math.round(amount)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.PAYSTACK_SECRET}` },
        },
      );

      const data = await response.json();

      if (!data.status) {
        return 0;
      }

      return data.data.fee || 0;
    } catch (error) {
      this.logger.warn(`Failed to fetch transfer fee: ${error}`);
      return 0;
    }
  }
}
