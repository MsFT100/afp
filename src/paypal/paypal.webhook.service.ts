import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PayPalService } from './paypal.service';
import { WalletsService } from '../wallet/wallet.service';
import { TransactionStatus, TransactionType } from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class PayPalWebhookService {
  private readonly logger = new Logger(PayPalWebhookService.name);

  constructor(
    private payPalService: PayPalService,
    private walletsService: WalletsService,
    private transactionsService: TransactionsService,
  ) {}

  async handleWebhook(headers: any, payload: any): Promise<void> {
    const isVerified = await this.payPalService.verifyWebhookSignature(headers, payload);
    if (!isVerified) {
      this.logger.error('PayPal webhook signature verification failed.');
      throw new BadRequestException('Invalid signature');
    }

    this.logger.log(`Received PayPal event: ${payload.event_type}`);

    // We listen for CHECKOUT.ORDER.COMPLETED or PAYMENTS.PAYMENT.COMPLETED
    if (payload.event_type !== 'CHECKOUT.ORDER.COMPLETED') {
      return;
    }

    const orderId = payload.resource.id;
    const amount = parseFloat(payload.resource.purchase_units[0].amount.value);

    // Find the pending transaction in our database to get the associated user
    const transaction = await this.transactionsService.transactionsRepository.findOne({
      where: { reference: orderId },
      relations: ['user'],
    });

    if (!transaction) {
      this.logger.error(`No pending transaction found for PayPal order ${orderId}`);
      return;
    }

    if (transaction.status === TransactionStatus.SUCCESS) {
      this.logger.warn(`PayPal transaction ${orderId} already processed.`);
      return;
    }

    await this.walletsService.creditUserWalletFromWebhook(
      transaction.user.id,
      amount,
      orderId,
      TransactionType.PAYPAL_DEPOSIT,
    );

    this.logger.log(`PayPal deposit successful for user ${transaction.user.id}: ${amount}`);
  }
}