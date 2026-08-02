import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaystackService } from './paystack.service';
import { WalletsService } from '../wallet/wallet.service';
import { User } from '../users/user.entity';
import {
  TransactionStatus,
  TransactionType,
} from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class PaystackWebhookService {
  private readonly logger = new Logger(PaystackWebhookService.name);

  constructor(
    private configService: ConfigService,
    private paystackService: PaystackService,
    private walletsService: WalletsService,
    private transactionsService: TransactionsService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    if (!this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET')) {
      throw new InternalServerErrorException(
        'PAYSTACK_WEBHOOK_SECRET is not configured.',
      );
    }
  }

  /**
   * Main webhook handler - routes to the appropriate handler based on event type.
   * Never throws to the caller: the controller always returns 200 to Paystack.
   */
  async handlePaymentWebhook(payload: any): Promise<void> {
    this.logger.log(`Received Paystack webhook event: ${payload.event}`);

    try {
      switch (payload.event) {
        case 'charge.success':
          await this.handleChargeSuccess(payload);
          break;
        case 'transfer.success':
          await this.handleTransferSuccess(payload);
          break;
        case 'transfer.failed':
          await this.handleTransferFailed(payload);
          break;
        case 'transfer.reversed':
          await this.handleTransferReversed(payload);
          break;
        default:
          this.logger.warn(`Unhandled event type: ${payload.event}`);
          break;
      }
    } catch (error: any) {
      this.logger.error(
        `Error processing webhook event ${payload.event}: ${error?.message}`,
        error?.stack,
      );
    }
  }

  // ==================== DEPOSIT ====================

  private async handleChargeSuccess(payload: any): Promise<void> {
    const reference = payload.data.reference;
    if (!reference) {
      throw new BadRequestException('Paystack webhook data missing reference.');
    }

    // Idempotency guard
    const existing =
      await this.transactionsService.transactionsRepository.findOne({
        where: { reference, status: TransactionStatus.SUCCESS },
      });
    if (existing) {
      this.logger.log(`Deposit ${reference} already processed; skipping`);
      return;
    }

    // Verify transaction directly with Paystack for security
    const verificationResult =
      await this.paystackService.verifyTransaction(reference);

    if (
      !verificationResult.status ||
      verificationResult.data.status !== 'success'
    ) {
      this.logger.error(
        `Paystack verification failed for reference ${reference}. Result: ${JSON.stringify(verificationResult)}`,
      );
      await this.transactionsService
        .updateTransactionStatus(reference, TransactionStatus.FAILED)
        .catch(() => {});
      return;
    }

    const amount = verificationResult.data.amount / 100;
    const currency = verificationResult.data.currency;
    const userEmail = verificationResult.data.customer.email;

    const user = await this.userRepository.findOne({
      where: { email: userEmail },
    });
    if (!user) {
      this.logger.error(
        `User not found for email ${userEmail} during webhook processing.`,
      );
      await this.transactionsService
        .updateTransactionStatus(reference, TransactionStatus.FAILED)
        .catch(() => {});
      return;
    }

    await this.walletsService.creditUserWalletFromWebhook(
      user.id,
      amount,
      reference,
      TransactionType.DEPOSIT,
      currency,
    );

    this.logger.log(
      `Successfully processed Paystack deposit for user ${user.id}, amount ${amount}, reference ${reference}`,
    );
  }

  // ==================== WITHDRAWALS / TRANSFERS ====================

  private async handleTransferSuccess(payload: any): Promise<void> {
    const reference = payload.data.reference;
    if (!reference) {
      throw new BadRequestException('Transfer reference missing in webhook');
    }

    this.logger.log(`Processing successful transfer: ${reference}`);
    await this.walletsService.handleWithdrawalWebhook(reference, 'success');
  }

  private async handleTransferFailed(payload: any): Promise<void> {
    const reference = payload.data.reference;
    if (!reference) {
      throw new BadRequestException('Transfer reference missing in webhook');
    }

    const failureReason =
      payload.data.failures?.message || payload.data.reason || 'Unknown error';
    this.logger.log(
      `Processing failed transfer: ${reference} (${failureReason})`,
    );
    await this.walletsService.handleWithdrawalWebhook(reference, 'failed');
  }

  private async handleTransferReversed(payload: any): Promise<void> {
    const reference = payload.data.reference;
    if (!reference) {
      throw new BadRequestException('Transfer reference missing in webhook');
    }

    const reason = payload.data.reason || 'Transfer reversed by recipient bank';
    this.logger.log(`Processing reversed transfer: ${reference} (${reason})`);
    await this.walletsService.handleWithdrawalWebhook(reference, 'reversed');
  }
}
