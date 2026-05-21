import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './wallet.entity';
import { User } from '../users/user.entity';
import { ConfigService } from '@nestjs/config';
import {
  TransactionStatus,
  TransactionType,
} from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { PaystackService } from '../paystack/paystack.service';
import { PayPalService } from '../paypal/paypal.service';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private payPalService: PayPalService, // Inject PayPalService
    private paystackService: PaystackService, // Inject PaystackService
    private configService: ConfigService,
    public transactionsService: TransactionsService, // Inject the new service
  ) {}

  async getOrCreateWallet(userId: string): Promise<Wallet> {
    let wallet = await this.walletRepository.findOne({
      where: { user: { id: userId } }, // Find by user ID
      relations: ['user'], // Eagerly load the user relation
    });

    if (!wallet) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      wallet = this.walletRepository.create({ user, balance: 0 });
      wallet = await this.walletRepository.save(wallet);
      // Ensure the user relation is set on the newly created wallet object
      wallet.user = user;
    }
    return wallet;
  }

  async deductBalance(userId: string, amount: number, type: TransactionType, reference: string): Promise<Wallet> {
    const wallet = await this.getOrCreateWallet(userId);
    const currentBalance = Number(wallet.balance);

    if (currentBalance < amount) {
      throw new BadRequestException('Insufficient balance for this purchase');
    }

    wallet.balance = currentBalance - amount;
    const updatedWallet = await this.walletRepository.save(wallet);

    await this.transactionsService.createTransaction(
      wallet.user,
      amount,
      reference,
      TransactionStatus.SUCCESS,
      type,
    );

    return updatedWallet;
  }

  async addBalance(userId: string, amount: number): Promise<Wallet> {
    const wallet = await this.getOrCreateWallet(userId);
    wallet.balance = Number(wallet.balance) + amount;
    const updatedWallet = await this.walletRepository.save(wallet);

    // Record the transaction for the manual balance addition
    const reference = `manual_deposit_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await this.transactionsService.createTransaction(
      wallet.user, // User is now guaranteed to be loaded with the wallet
      amount,
      reference,
      TransactionStatus.SUCCESS,
      TransactionType.MANUAL_ADJUSTMENT,
    );

    return updatedWallet;
  }

  async initiatePayPalPayment(userId: string, amount: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Create a pending transaction record
    const pendingTransaction = await this.transactionsService.createTransaction(
      user,
      amount,
      `paypal_init_${Date.now()}`, // Temporary reference
      TransactionStatus.PENDING,
      TransactionType.PAYPAL_DEPOSIT,
    );

    try {
      const order = await this.payPalService.createOrder(amount);
      // Update the transaction reference with PayPal's order ID
      pendingTransaction.reference = order.id;
      await this.transactionsService.transactionsRepository.save(pendingTransaction);
      return order; // Return PayPal order details to the frontend
    } catch (error) {
      pendingTransaction.status = TransactionStatus.FAILED;
      await this.transactionsService.transactionsRepository.save(pendingTransaction);
      throw error; // Re-throw the PayPal error
    }
  }

  async verifyPayPalPayment(userId: string, orderId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const capturedOrder = await this.payPalService.captureOrder(orderId);

    if (capturedOrder.status !== 'COMPLETED') {
      throw new BadRequestException('PayPal payment not completed.');
    }

    const amountReceived = parseFloat(
      capturedOrder.purchase_units[0].payments.captures[0].amount.value,
    );

    return this.creditUserWalletFromWebhook(
      userId,
      amountReceived,
      orderId,
      TransactionType.PAYPAL_DEPOSIT,
    );
  }

  async initializePayment(userId: string, amount: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Create a pending transaction record
    const pendingTransaction = await this.transactionsService.createTransaction(
      user,
      amount,
      `paystack_init_${Date.now()}`, // Temporary reference, will be updated by Paystack
      TransactionStatus.PENDING,
      TransactionType.DEPOSIT,
    );

    const baseUrl = this.configService.get<string>('PAYSTACK_CALLBACK_URL');
    
    if (!baseUrl) {
      this.logger.error('PAYSTACK_CALLBACK_URL is not defined in environment variables');
      throw new InternalServerErrorException('Payment configuration error');
    }

    const callbackUrl = `${baseUrl}?transactionRef=${pendingTransaction.reference}`;

    // Paystack expects amount in the smallest currency unit (e.g., Kobo)
    const amountInKobo = Math.round(amount * 100);

    try {
      const data: any = await this.paystackService.initializeTransaction(
        user.email,
        amountInKobo,
        callbackUrl,
      );

      if (!data.status) {
        throw new Error(data.message || 'Paystack initialization failed');
      }

      //console.log(`Paystack initialization successful for user ${userId}:`, data);

      return data.data; // Returns authorization_url and reference
    } catch (error: any) {
      this.logger.error(`Paystack init failed for user ${userId}: ${error?.message || error}`, error?.stack);
      pendingTransaction.status = TransactionStatus.FAILED;
      await this.transactionsService.transactionsRepository.save(pendingTransaction);
      const message = error instanceof Error ? error.message : 'Paystack initialization failed';
      throw new BadRequestException(message);
    }
  }

  // New method for processing webhooks
  async creditUserWalletFromWebhook(
    userId: string,
    amount: number,
    reference: string,
    type: TransactionType = TransactionType.DEPOSIT,
  ): Promise<Wallet> {
    const wallet = await this.getOrCreateWallet(userId);

    // Check if this transaction has already been successfully processed
    const existingTransaction = await this.transactionsService.transactionsRepository.findOne({
      where: { reference, status: TransactionStatus.SUCCESS },
    });

    if (existingTransaction) {
      // Transaction already processed, no need to update balance again
      this.transactionsService.updateTransactionStatus(reference, TransactionStatus.SUCCESS, amount);
      return wallet;
    }

    // Update wallet balance
    wallet.balance = Number(wallet.balance) + amount;
    const updatedWallet = await this.walletRepository.save(wallet);

    // Update or create transaction record
    await this.transactionsService.updateTransactionStatus(reference, TransactionStatus.SUCCESS, amount)
      .catch(async () => { // If updateTransactionStatus throws because no pending transaction found, create one
        await this.transactionsService.createTransaction(
          wallet.user,
          amount,
          reference,
          TransactionStatus.SUCCESS,
          type,
        );
      });
    return updatedWallet;
  }

  async verifyPayment(userId: string, reference: string) {
    const data: any = await this.paystackService.verifyTransaction(reference);

    if (!data.status || data.data.status !== 'success') {
      // If the transaction failed, ensure we mark our local record as failed too
      await this.transactionsService.updateTransactionStatus(reference, TransactionStatus.FAILED);
      throw new BadRequestException(
        data.message || 'Transaction was not successful',
      );
    }

    const amountReceived = data.data.amount / 100;

    return this.creditUserWalletFromWebhook(
      userId,
      amountReceived,
      reference,
      TransactionType.DEPOSIT,
    );
  }

  async getUsersBalances(page: number, limit: number) {
    const [users, total] = await this.userRepository.findAndCount({
      relations: ['wallet'],
      order: { email: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        balance: user.wallet ? Number(user.wallet.balance) : 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async transfer(senderId: string, recipientEmail: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be greater than 0');
    }

    const sender = await this.userRepository.findOne({
      where: { id: senderId },
      relations: ['wallet'],
    });
    if (!sender) throw new NotFoundException('Sender not found');
    if (!sender.wallet) throw new NotFoundException('Sender wallet not found');

    if (Number(sender.wallet.balance) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const recipient = await this.userRepository.findOne({
      where: { email: recipientEmail },
      relations: ['wallet'],
    });
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (recipient.id === senderId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    const recipientWallet = await this.getOrCreateWallet(recipient.id);

    const reference = `transfer_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    sender.wallet.balance = Number(sender.wallet.balance) - amount;
    await this.walletRepository.save(sender.wallet);

    recipientWallet.balance = Number(recipientWallet.balance) + amount;
    await this.walletRepository.save(recipientWallet);

    await this.transactionsService.createTransaction(
      sender,
      amount,
      reference,
      TransactionStatus.SUCCESS,
      TransactionType.TRANSFER,
    );

    await this.transactionsService.createTransaction(
      recipient,
      amount,
      reference,
      TransactionStatus.SUCCESS,
      TransactionType.TRANSFER,
    );

    return {
      success: true,
      message: `Successfully transferred ${amount} to ${recipientEmail}`,
      reference,
    };
  }
}
