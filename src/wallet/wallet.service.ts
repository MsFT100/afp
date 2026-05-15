import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
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

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
    const paystackSecret = this.configService.get<string>(
      'PAYSTACK_SECRET_KEY',
    );

    const response = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: amount * 100, // Paystack expects amount in kobo
          callback_url: `${this.configService.get<string>('PAYSTACK_CALLBACK_URL')}?transactionRef=${pendingTransaction.reference}`,
        }),
      },
    );

    const data = await response.json();
    if (!data.status) {
      // Update pending transaction to failed if initialization fails
      pendingTransaction.status = TransactionStatus.FAILED;
      await this.transactionsService.createTransaction(
        user,
        amount,
        pendingTransaction.reference,
        TransactionStatus.FAILED,
        TransactionType.DEPOSIT,
      );

      throw new BadRequestException(
        data.message || 'Paystack initialization failed',
      );
    }

    return data.data; // Returns authorization_url and reference
  }

  async verifyPayment(userId: string, reference: string) {
    const paystackSecret = this.configService.get<string>(
      'PAYSTACK_SECRET_KEY',
    );

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
        },
      },
    );

    const data = await response.json();

    if (!data.status || data.data.status !== 'success') {
      throw new BadRequestException('Transaction was not successful');
    }

    const wallet = await this.getOrCreateWallet(userId);

    // Check if a transaction with this reference already exists and is successful
    const existingTransaction =
      await this.transactionsService.transactionsRepository.findOne({
        where: { reference, status: TransactionStatus.SUCCESS },
      });

    if (existingTransaction) {
      // If already processed, just return the wallet
      return wallet;
    }

    const amountReceived = data.data.amount / 100; // Convert kobo to Naira/Main unit

    try {
      // Find or create the transaction record
      let transaction =
        await this.transactionsService.transactionsRepository.findOne({
          where: { reference },
          relations: ['user'],
        });

      if (!transaction) {
        // If for some reason the initial pending transaction wasn't saved or found, create a new one
        const user = await this.userRepository.findOne({
          where: { id: userId },
        });
        if (!user) throw new NotFoundException('User not found');
        transaction = await this.transactionsService.createTransaction(
          user,
          amountReceived,
          reference,
          TransactionStatus.SUCCESS,
          TransactionType.DEPOSIT,
        );
      } else {
        // Update existing pending transaction
        transaction.status = TransactionStatus.SUCCESS;
        transaction.amount = amountReceived; // Ensure amount matches verified amount
        await this.transactionsService.transactionsRepository.save(transaction);
      }

      wallet.balance = Number(wallet.balance) + amountReceived;
      wallet.lastTransactionRef = reference; // Keep track of the last successful reference

      return await this.walletRepository.save(wallet);
    } catch (error) {
      throw new InternalServerErrorException('Failed to update wallet balance');
    }
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
