import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PaystackService } from './paystack.service';
import { WalletsService } from '../wallet/wallet.service';
import { User } from '../users/user.entity';
import { TransactionStatus, TransactionType } from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class PaystackWebhookService {
  private readonly logger = new Logger(PaystackWebhookService.name);
  private readonly PAYSTACK_WEBHOOK_SECRET: string;

  constructor(
    private configService: ConfigService,
    private paystackService: PaystackService,
    private walletsService: WalletsService,
    private transactionsService: TransactionsService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    this.PAYSTACK_WEBHOOK_SECRET = this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET')!;
    if (!this.PAYSTACK_WEBHOOK_SECRET) {
      throw new InternalServerErrorException(
        'PAYSTACK_WEBHOOK_SECRET is not configured.',
      );
    }
  }

  verifySignature(signature: string, payload: any): boolean {
    const hash = crypto
      .createHmac('sha512', this.PAYSTACK_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hash === signature;
  }

  async handlePaymentWebhook(payload: any): Promise<void> {
    this.logger.log(`Received Paystack webhook event: ${payload.event}`);

    if (payload.event !== 'charge.success') {
      this.logger.warn(`Unhandled event type: ${payload.event}`);
      return; // Only process successful charges for now
    }

    const reference = payload.data.reference;
    if (!reference) {
      throw new BadRequestException('Paystack webhook data missing reference.');
    }

    // Verify transaction directly with Paystack for security reasons
    const verificationResult = await this.paystackService.verifyTransaction(reference);

    if (!verificationResult.status || verificationResult.data.status !== 'success') {
      this.logger.error(`Paystack verification failed for reference ${reference}. Result: ${JSON.stringify(verificationResult)}`);
      // Update transaction status to failed in your DB
      await this.transactionsService.updateTransactionStatus(reference, TransactionStatus.FAILED);
      throw new BadRequestException('Paystack verification did not return success.');
    }

    const amount = verificationResult.data.amount / 100; // Convert kobo to main unit
    const currency = verificationResult.data.currency;
    const userEmail = verificationResult.data.customer.email;

    // Find user by email and update their wallet
    // Note: This relies on user.email matching the one sent to Paystack.
    // For a more robust solution, you might store your internal userId in Paystack metadata
    const user = await this.userRepository.findOne({ where: { email: userEmail } });
    if (!user) {
      this.logger.error(`User not found for email ${userEmail} during webhook processing.`);
      await this.transactionsService.updateTransactionStatus(reference, TransactionStatus.FAILED); // Mark transaction as failed if user not found
      throw new NotFoundException('User not found for this transaction.');
    }

    await this.walletsService.creditUserWalletFromWebhook(user.id, amount, reference, TransactionType.DEPOSIT, currency);
    this.logger.log(`Successfully processed Paystack webhook for user ${user.id}, amount ${amount}, reference ${reference}`);
  }
}