import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { Wallet } from './wallet.entity';
import { User } from '../users/user.entity';
import { CurrencyPair } from '../currency/currency-pair.entity';
import { ConfigService } from '@nestjs/config';
import {
  TransactionStatus,
  TransactionType,
} from '../transactions/transaction.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { PaystackService } from '../paystack/paystack.service';
import { PayPalService } from '../paypal/paypal.service';
import {
  InitiateWithdrawalDto,
  SaveBankDetailsDto,
  SaveMobileMoneyDetailsDto,
  WithdrawalResponseDto,
  WithdrawalLimitsDto,
  WithdrawalStatsDto,
  WithdrawalMethod,
} from './dto/withdrawal.dto';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  private readonly COIN_PRICE_USD = 0.01;

  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(CurrencyPair)
    private currencyPairRepository: Repository<CurrencyPair>,
    private payPalService: PayPalService,
    private paystackService: PaystackService,
    private configService: ConfigService,
    public transactionsService: TransactionsService,
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

  async deductBalance(
    userId: string,
    amount: number,
    type: TransactionType,
    reference: string,
  ): Promise<Wallet> {
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
      await this.transactionsService.transactionsRepository.save(
        pendingTransaction,
      );
      return order; // Return PayPal order details to the frontend
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `PayPal order creation failed for user ${userId}: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `PayPal order creation failed for user ${userId}: Unknown error`,
          error,
        );
      }
      pendingTransaction.status = TransactionStatus.FAILED;
      await this.transactionsService.transactionsRepository.save(
        pendingTransaction,
      );
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'Failed to initiate PayPal payment due to an unknown error',
      );
    }
  }

  async verifyPayPalPayment(userId: string, orderId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const capturedOrder = await this.payPalService.captureOrder(orderId);

    if (capturedOrder.status !== 'COMPLETED') {
      this.logger.warn(
        `PayPal capture attempted for order ${orderId} but status was ${capturedOrder.status}`,
      );
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
      'USD',
    );
  }

  private readonly supportedCurrencies = [
    'NGN',
    'GHS',
    'ZAR',
    'USD',
    'KES',
    'EGP',
    'XAF',
    'XOF',
    'RWF',
    'TZS',
    'UGX',
    'MAD',
    'ETB',
    'SLL',
  ];

  async initializePayment(
    userId: string,
    amount: number,
    currency: string = 'NGN',
    method?: string,
    phone?: string,
  ) {
    const isMpesa = method === 'mpesa';
    const normalizedCurrency = (isMpesa ? 'KES' : currency).toUpperCase();
    if (!this.supportedCurrencies.includes(normalizedCurrency)) {
      throw new BadRequestException(
        `Unsupported currency "${normalizedCurrency}". Supported currencies: ${this.supportedCurrencies.join(', ')}`,
      );
    }

    if (isMpesa && !phone) {
      throw new BadRequestException(
        'An M-Pesa phone number is required for mobile money deposits.',
      );
    }
    const mpesaPhone = isMpesa ? (phone as string) : undefined;

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
      this.logger.error(
        'PAYSTACK_CALLBACK_URL is not defined in environment variables',
      );
      throw new InternalServerErrorException('Payment configuration error');
    }

    const callbackUrl = `${baseUrl}?transactionRef=${pendingTransaction.reference}`;

    try {
      let chargeAmount = amount;
      let paystackOptions: { channels?: string[]; phone?: string } | undefined;
      if (isMpesa) {
        chargeAmount = await this.convertUsdToLocal(amount, 'KES');
        paystackOptions = {
          channels: ['mobile_money'],
          phone: this.normalizeMpesaPhone(mpesaPhone!),
        };
      }

      const data: any = await this.paystackService.initializeTransaction(
        user.email,
        chargeAmount,
        callbackUrl,
        normalizedCurrency,
        ...(paystackOptions ? [paystackOptions] : []),
      );

      if (!data.status) {
        throw new Error(data.message || 'Paystack initialization failed');
      }

      return data.data; // Returns authorization_url and reference
    } catch (error: any) {
      if (error instanceof Error) {
        this.logger.error(
          `Paystack init failed for user ${userId}: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Paystack init failed for user ${userId}: Unknown error`,
          error,
        );
      }
      pendingTransaction.status = TransactionStatus.FAILED;
      await this.transactionsService.transactionsRepository.save(
        pendingTransaction,
      );
      const message =
        error instanceof Error
          ? error.message
          : 'Paystack initialization failed due to an unknown error';
      throw new BadRequestException(message);
    }
  }

  private normalizeMpesaPhone(phone: string): string {
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('254')) {
      return cleaned;
    }
    if (cleaned.startsWith('0')) {
      return '254' + cleaned.slice(1);
    }
    if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
      return '254' + cleaned;
    }
    return cleaned;
  }

  private async convertUsdToLocal(
    usdAmount: number,
    currency: string,
  ): Promise<number> {
    const normalized = currency.toUpperCase();
    if (normalized === 'USD') {
      return usdAmount;
    }
    const pair = await this.currencyPairRepository.findOne({
      where: { baseCurrency: 'USD', quoteCurrency: normalized },
    });
    if (pair) {
      const rate = Number(pair.rate);
      return Math.round(usdAmount * rate * 100) / 100;
    }
    this.logger.warn(`No exchange rate found for USD/${normalized}, using 1:1`);
    return usdAmount;
  }

  private async convertToCoins(
    amount: number,
    currency: string,
  ): Promise<number> {
    const normalized = currency.toUpperCase();
    if (normalized === 'USD') {
      return Math.round(amount / this.COIN_PRICE_USD);
    }
    const pair = await this.currencyPairRepository.findOne({
      where: { baseCurrency: 'USD', quoteCurrency: normalized },
    });
    if (!pair) {
      this.logger.warn(
        `No exchange rate found for USD/${normalized}, crediting raw amount as coins`,
      );
      return Math.round(amount);
    }
    const rate = Number(pair.rate);
    const usdAmount = amount / rate;
    return Math.round(usdAmount / this.COIN_PRICE_USD);
  }

  async creditUserWalletFromWebhook(
    userId: string,
    amount: number,
    reference: string,
    type: TransactionType = TransactionType.DEPOSIT,
    currency: string = 'USD',
  ): Promise<Wallet> {
    const wallet = await this.getOrCreateWallet(userId);

    // Check if this transaction has already been successfully processed
    const existingTransaction =
      await this.transactionsService.transactionsRepository.findOne({
        where: { reference, status: TransactionStatus.SUCCESS },
      });

    if (existingTransaction) {
      this.transactionsService.updateTransactionStatus(
        reference,
        TransactionStatus.SUCCESS,
        amount,
      );
      return wallet;
    }

    // Convert from local currency to coins
    const coinAmount = await this.convertToCoins(amount, currency);

    // Update wallet balance with coin amount
    wallet.balance = Number(wallet.balance) + coinAmount;
    const updatedWallet = await this.walletRepository.save(wallet);

    // Update or create transaction record with coin amount
    await this.transactionsService
      .updateTransactionStatus(reference, TransactionStatus.SUCCESS, coinAmount)
      .catch(async () => {
        await this.transactionsService.createTransaction(
          wallet.user,
          coinAmount,
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
      await this.transactionsService.updateTransactionStatus(
        reference,
        TransactionStatus.FAILED,
      );
      throw new BadRequestException(
        data.message || 'Transaction was not successful',
      );
    }

    const amountReceived = data.data.amount / 100;
    const currency = data.data.currency;

    return this.creditUserWalletFromWebhook(
      userId,
      amountReceived,
      reference,
      TransactionType.DEPOSIT,
      currency,
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

  async deductTableFee(
    userId: string,
    amount: number,
    matchId: string,
  ): Promise<Wallet> {
    const reference = `table_fee_${matchId}_${Date.now()}`;
    return this.deductBalance(
      userId,
      amount,
      TransactionType.TABLE_FEE,
      reference,
    );
  }

  // ==================== WITHDRAWAL ====================

  async listBanks(country?: string): Promise<any[]> {
    return this.paystackService.listBanks(country);
  }

  async saveBankDetails(userId: string, dto: SaveBankDetailsDto): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const verification = await this.paystackService.resolveAccountNumber(
      dto.accountNumber,
      dto.bankCode,
    );

    user.bankName = dto.bankName || null;
    user.bankCode = dto.bankCode;
    user.accountNumber = dto.accountNumber;
    user.accountHolderName = dto.accountHolderName;
    user.accountVerified = true;
    user.bankVerificationDate = new Date();
    user.bankVerificationMethod = 'account_resolution';
    user.withdrawalCurrency = dto.currency || user.withdrawalCurrency || 'USD';
    user.allowWithdrawals = true;
    user.paystackRecipientCode = null; // details changed, invalidate cached recipient
    if (dto.setAsDefault) {
      user.preferredWithdrawalMethod = WithdrawalMethod.BANK_TRANSFER;
    }
    await this.userRepository.save(user);

    this.logger.log(`Bank details saved for user ${userId}`);

    return {
      success: true,
      message: 'Bank details saved successfully',
      accountHolderName: verification.account_name,
    };
  }

  async saveMobileMoneyDetails(
    userId: string,
    dto: SaveMobileMoneyDetailsDto,
  ): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const cleaned = dto.phoneNumber.replace(/[\s-]/g, '');
    if (!/^\d{10,13}$/.test(cleaned)) {
      throw new BadRequestException('Invalid phone number format');
    }

    user.mobileMoneyProvider = dto.provider;
    user.mobileMoneyNumber = cleaned;
    user.accountHolderName = dto.accountHolderName;
    user.withdrawalCurrency = dto.currency || user.withdrawalCurrency || 'USD';
    user.allowWithdrawals = true;
    user.paystackRecipientCode = null;
    if (dto.setAsDefault) {
      user.preferredWithdrawalMethod = WithdrawalMethod.MOBILE_MONEY;
    }
    await this.userRepository.save(user);

    this.logger.log(`Mobile money details saved for user ${userId}`);

    return {
      success: true,
      message: 'Mobile money details saved successfully',
      provider: user.mobileMoneyProvider,
    };
  }

  async getUserWithdrawalDetails(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['wallet'],
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      balance: Number(user.wallet.balance) || 0,
      bankDetails: user.bankCode
        ? {
            bankName: user.bankName,
            bankCode: user.bankCode,
            accountNumber: user.accountNumber?.slice(-4),
            accountHolderName: user.accountHolderName,
            verified: user.accountVerified,
            verificationDate: user.bankVerificationDate,
          }
        : null,
      mobileMoneyDetails: user.mobileMoneyProvider
        ? {
            provider: user.mobileMoneyProvider,
            phoneNumber: this.maskPhoneNumber(user.mobileMoneyNumber),
            accountHolderName: user.accountHolderName,
          }
        : null,
      preferredMethod: user.preferredWithdrawalMethod,
      allowWithdrawals: user.allowWithdrawals,
      withdrawalCurrency: user.withdrawalCurrency,
      withdrawalLimits: await this.getWithdrawalLimits(userId),
    };
  }

  async verifyBankDetails(
    bankCode: string,
    accountNumber: string,
  ): Promise<any> {
    const verification = await this.paystackService.resolveAccountNumber(
      accountNumber,
      bankCode,
    );
    return { valid: true, accountHolderName: verification.account_name };
  }

  async initiateWithdrawal(
    userId: string,
    dto: InitiateWithdrawalDto,
  ): Promise<WithdrawalResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['wallet'],
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.wallet) throw new NotFoundException('Wallet not found');

    if (!user.allowWithdrawals) {
      const hasPayoutDetails = Boolean(
        user.bankCode || user.mobileMoneyProvider,
      );
      const message = hasPayoutDetails
        ? 'Withdrawals are not enabled for your account. Re-save your bank or mobile money details, or contact support.'
        : 'Withdrawals are not enabled for your account. Please add and save your bank or mobile money payout details first, then try again.';
      throw new ForbiddenException(message);
    }

    if (dto.coins <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than 0');
    }

    if (Number(user.wallet.balance) < dto.coins) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${Number(user.wallet.balance)} coins`,
      );
    }

    const currency = user.withdrawalCurrency || 'USD';
    const fiatAmount = await this.convertCoinsToFiat(dto.coins, currency);
    const amountInSmallestUnit = Math.round(fiatAmount * 100);

    const dailyWithdrawn = await this.getDailyWithdrawalTotal(userId);
    if (dailyWithdrawn + dto.coins > Number(user.dailyWithdrawalLimit)) {
      throw new BadRequestException(
        `Daily withdrawal limit exceeded. Remaining today: ${Math.max(0, Number(user.dailyWithdrawalLimit) - dailyWithdrawn)} coins`,
      );
    }

    const monthlyWithdrawn = Number(user.monthlyWithdrawalTotal) || 0;
    if (monthlyWithdrawn + dto.coins > Number(user.monthlyWithdrawalLimit)) {
      throw new BadRequestException(
        `Monthly withdrawal limit exceeded. Remaining this month: ${Math.max(0, Number(user.monthlyWithdrawalLimit) - monthlyWithdrawn)} coins`,
      );
    }

    try {
      let recipientCode: string;

      if (dto.withdrawalMethod === WithdrawalMethod.BANK_TRANSFER) {
        const bankCode = dto.bankCode || user.bankCode;
        const accountNumber = dto.accountNumber || user.accountNumber;
        const accountHolderName =
          dto.accountHolderName || user.accountHolderName;

        if (!bankCode || !accountNumber || !accountHolderName) {
          throw new BadRequestException(
            'Bank details are required for withdrawal',
          );
        }

        // Inline bank details must be verified first (saved ones were verified on save)
        if (
          dto.accountNumber &&
          (dto.accountNumber !== user.accountNumber ||
            dto.bankCode !== user.bankCode)
        ) {
          await this.paystackService.resolveAccountNumber(
            dto.accountNumber,
            bankCode,
          );
        }

        recipientCode = await this.getOrCreateRecipient(
          user,
          'bank',
          accountNumber,
          bankCode,
          accountHolderName,
          currency,
        );
      } else {
        const phoneNumber = dto.phoneNumber || user.mobileMoneyNumber;
        const provider = dto.mobileMoneyProvider || user.mobileMoneyProvider;
        const accountHolderName =
          dto.accountHolderName || user.accountHolderName;

        if (!phoneNumber || !provider || !accountHolderName) {
          throw new BadRequestException(
            'Mobile money details are required for withdrawal',
          );
        }

        recipientCode = await this.getOrCreateRecipient(
          user,
          'mobile_money',
          phoneNumber,
          undefined,
          accountHolderName,
          currency,
          provider,
        );
      }

      const reference = `withdrawal_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      await this.paystackService.initiateTransfer(
        recipientCode,
        amountInSmallestUnit,
        dto.reason || `Withdrawal of ${dto.coins} coins`,
        reference,
      );

      // Deduct coins immediately (optimistic)
      const wallet = user.wallet;
      wallet.balance = Number(wallet.balance) - dto.coins;
      await this.walletRepository.save(wallet);

      await this.transactionsService.createTransaction(
        user,
        dto.coins,
        reference,
        TransactionStatus.PENDING,
        TransactionType.WITHDRAWAL,
      );

      user.monthlyWithdrawalTotal = monthlyWithdrawn + dto.coins;
      user.lastWithdrawalDate = new Date();
      user.consecutiveWithdrawalFailures = 0;
      await this.userRepository.save(user);

      const fee =
        await this.paystackService.getTransferFee(amountInSmallestUnit);

      this.logger.log(
        `Withdrawal initiated for user ${userId}: ${reference}, coins: ${dto.coins}, fiat: ${fiatAmount} ${currency}`,
      );

      return {
        success: true,
        message:
          'Withdrawal request submitted successfully. Please wait 2-24 hours for funds to arrive.',
        reference,
        coins: dto.coins,
        amountInFiat: fiatAmount,
        currency,
        fee: fee / 100,
        status: 'pending',
        estimatedArrival: '2-24 hours depending on your bank',
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to initiate withdrawal for user ${userId}: ${error?.message}`,
        error?.stack,
      );

      user.consecutiveWithdrawalFailures =
        (user.consecutiveWithdrawalFailures || 0) + 1;
      if (user.consecutiveWithdrawalFailures >= 3) {
        user.allowWithdrawals = false;
        this.logger.warn(
          `Withdrawals disabled for user ${userId} due to consecutive failures`,
        );
      }
      await this.userRepository.save(user);

      throw new BadRequestException(
        error?.message || 'Failed to initiate withdrawal',
      );
    }
  }

  async handleWithdrawalWebhook(
    reference: string,
    status: 'success' | 'failed' | 'reversed',
  ): Promise<void> {
    const transaction =
      await this.transactionsService.transactionsRepository.findOne({
        where: { reference, type: TransactionType.WITHDRAWAL },
        relations: ['user'],
      });

    if (!transaction) {
      this.logger.warn(
        `Withdrawal webhook received but transaction not found: ${reference}`,
      );
      return;
    }

    // Idempotency guard: skip if already finalized
    if (transaction.status === TransactionStatus.SUCCESS) return;
    if (status !== 'success' && transaction.status === TransactionStatus.FAILED)
      return;

    const user = transaction.user;
    if (!user) {
      this.logger.warn(
        `Withdrawal transaction ${reference} has no user; skipping`,
      );
      return;
    }

    if (status === 'success') {
      await this.transactionsService.updateTransactionStatus(
        reference,
        TransactionStatus.SUCCESS,
      );
      user.consecutiveWithdrawalFailures = 0;
      await this.userRepository.save(user);
      this.logger.log(`Withdrawal successful: ${reference}`);
      return;
    }

    // failed / reversed -> refund coins
    const wallet = await this.getOrCreateWallet(user.id);
    wallet.balance = Number(wallet.balance) + Number(transaction.amount);
    await this.walletRepository.save(wallet);

    await this.transactionsService.updateTransactionStatus(
      reference,
      TransactionStatus.FAILED,
    );

    user.consecutiveWithdrawalFailures =
      (user.consecutiveWithdrawalFailures || 0) + 1;
    if (user.consecutiveWithdrawalFailures >= 3) {
      user.allowWithdrawals = false;
      this.logger.warn(
        `Withdrawals disabled for user ${user.id} due to consecutive failures`,
      );
    }
    user.monthlyWithdrawalTotal = Math.max(
      0,
      (Number(user.monthlyWithdrawalTotal) || 0) - Number(transaction.amount),
    );
    await this.userRepository.save(user);

    this.logger.log(
      `Withdrawal ${status}: ${reference}, amount refunded to wallet`,
    );
  }

  async getWithdrawalHistory(
    userId: string,
    page = 1,
    limit = 10,
    status?: string,
  ) {
    const where: any = {
      user: { id: userId },
      type: TransactionType.WITHDRAWAL,
    };
    if (status) where.status = status;

    const [transactions, total] =
      await this.transactionsService.transactionsRepository.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

    return {
      data: transactions.map((t) => ({
        reference: t.reference,
        coins: Number(t.amount),
        status: t.status,
        createdAt: t.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getWithdrawalStats(userId: string): Promise<WithdrawalStatsDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const transactions =
      await this.transactionsService.transactionsRepository.find({
        where: { user: { id: userId }, type: TransactionType.WITHDRAWAL },
      });

    const successful = transactions.filter(
      (t) => t.status === TransactionStatus.SUCCESS,
    );
    const totalWithdrawn = successful.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );
    const pending = transactions.filter(
      (t) => t.status === TransactionStatus.PENDING,
    );
    const failed = transactions.filter(
      (t) => t.status === TransactionStatus.FAILED,
    );

    return {
      totalWithdrawn,
      totalPending: pending.reduce((sum, t) => sum + Number(t.amount), 0),
      totalFailed: failed.reduce((sum, t) => sum + Number(t.amount), 0),
      averageWithdrawal: successful.length
        ? Math.round(totalWithdrawn / successful.length)
        : 0,
      lastWithdrawalDate: user.lastWithdrawalDate,
      consecutiveFailures: user.consecutiveWithdrawalFailures,
      allowWithdrawals: user.allowWithdrawals,
    };
  }

  async getWithdrawalLimits(userId: string): Promise<WithdrawalLimitsDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const dailyWithdrawn = await this.getDailyWithdrawalTotal(userId);
    const monthlyWithdrawn = Number(user.monthlyWithdrawalTotal) || 0;
    const dailyLimit = Number(user.dailyWithdrawalLimit);
    const monthlyLimit = Number(user.monthlyWithdrawalLimit);

    return {
      dailyLimit,
      dailyWithdrawn,
      remainingDaily: Math.max(0, dailyLimit - dailyWithdrawn),
      monthlyLimit,
      monthlyWithdrawn,
      remainingMonthly: Math.max(0, monthlyLimit - monthlyWithdrawn),
    };
  }

  // ==================== WITHDRAWAL HELPERS ====================

  private async getOrCreateRecipient(
    user: User,
    kind: 'bank' | 'mobile_money',
    accountNumber: string,
    bankCode: string | undefined,
    accountHolderName: string,
    currency: string,
    provider?: string,
  ): Promise<string> {
    const detailsChanged =
      (kind === 'bank' &&
        (user.accountNumber !== accountNumber || user.bankCode !== bankCode)) ||
      (kind === 'mobile_money' &&
        (user.mobileMoneyNumber !== accountNumber ||
          user.mobileMoneyProvider !== provider));

    if (user.paystackRecipientCode && !detailsChanged) {
      return user.paystackRecipientCode;
    }

    let type: 'nuban' | 'ghipss' | 'basa' | 'mobile_money';
    if (kind === 'mobile_money') {
      type = 'mobile_money';
    } else {
      type = this.recipientTypeForCurrency(currency);
    }

    const recipient = await this.paystackService.createRecipient(
      type,
      accountHolderName,
      accountNumber,
      bankCode,
      currency,
      provider,
    );

    user.paystackRecipientCode = recipient.recipient_code;
    await this.userRepository.save(user);
    return recipient.recipient_code;
  }

  private recipientTypeForCurrency(
    currency: string,
  ): 'nuban' | 'ghipss' | 'basa' {
    switch ((currency || '').toUpperCase()) {
      case 'GHS':
        return 'ghipss';
      case 'ZAR':
        return 'basa';
      default:
        return 'nuban';
    }
  }

  private async convertCoinsToFiat(
    coins: number,
    currency: string,
  ): Promise<number> {
    const normalized = currency.toUpperCase();
    const usdAmount = coins * this.COIN_PRICE_USD;
    if (normalized === 'USD') return Math.round(usdAmount * 100) / 100;

    const pair = await this.currencyPairRepository.findOne({
      where: { baseCurrency: 'USD', quoteCurrency: normalized },
    });
    if (!pair) {
      this.logger.warn(
        `No exchange rate found for USD/${normalized}, using 1:1`,
      );
      return Math.round(usdAmount * 100) / 100;
    }

    const fiat = usdAmount * Number(pair.rate);
    return Math.round(fiat * 100) / 100;
  }

  private maskPhoneNumber(phoneNumber?: string | null): string {
    if (!phoneNumber || phoneNumber.length < 4) return phoneNumber || '';
    return `****${phoneNumber.slice(-4)}`;
  }

  private async getDailyWithdrawalTotal(userId: string): Promise<number> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const transactions =
      await this.transactionsService.transactionsRepository.find({
        where: {
          user: { id: userId },
          type: TransactionType.WITHDRAWAL,
          status: In([TransactionStatus.PENDING, TransactionStatus.SUCCESS]),
          createdAt: MoreThanOrEqual(startOfToday),
        },
      });

    return transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  }
}
