import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { WalletsService } from './wallet.service';
import { Wallet } from './wallet.entity';
import { User } from '../users/user.entity';
import { CurrencyPair } from '../currency/currency-pair.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { PaystackService } from '../paystack/paystack.service';
import { PayPalService } from '../paypal/paypal.service';
import { ConfigService } from '@nestjs/config';
import {
  TransactionStatus,
  TransactionType,
} from '../transactions/transaction.entity';
import { WithdrawalMethod } from './dto/withdrawal.dto';

describe('WalletsService', () => {
  let service: WalletsService;
  let userRepository: any;
  let walletRepository: any;
  let paystackService: any;
  let configService: any;
  let transactionsService: any;
  let currencyPairRepository: any;

  const mockUser = { id: 'user-1', email: 'player@test.com' } as User;
  const mockTransaction = {
    id: 'tx-1',
    reference: 'paystack_init_1234567890',
    status: TransactionStatus.PENDING,
  };

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    walletRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    paystackService = {
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
      createRecipient: jest.fn(),
      initiateTransfer: jest.fn(),
      verifyTransfer: jest.fn(),
      listBanks: jest.fn(),
      resolveAccountNumber: jest.fn(),
      getTransferFee: jest.fn(),
    };

    configService = {
      get: jest.fn(),
    };

    transactionsService = {
      createTransaction: jest.fn(),
      transactionsRepository: {
        save: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        findAndCount: jest.fn(),
      },
    };

    currencyPairRepository = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: getRepositoryToken(Wallet), useValue: walletRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(CurrencyPair),
          useValue: currencyPairRepository,
        },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: PaystackService, useValue: paystackService },
        { provide: PayPalService, useValue: { createOrder: jest.fn() } },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  describe('initializePayment', () => {
    const amount = 500;
    const currency = 'NGN';

    it('should return authorization_url on successful Paystack init', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      configService.get.mockReturnValue('https://example.com/payment/callback');
      transactionsService.createTransaction.mockResolvedValue(mockTransaction);
      paystackService.initializeTransaction.mockResolvedValue({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/abc123',
          access_code: 'abc123',
          reference: 'ref-123',
        },
      });

      const result = await service.initializePayment(
        'user-1',
        amount,
        currency,
      );

      expect(result).toEqual({
        authorization_url: 'https://checkout.paystack.com/abc123',
        access_code: 'abc123',
        reference: 'ref-123',
      });

      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        mockUser.email,
        amount,
        `https://example.com/payment/callback?transactionRef=${mockTransaction.reference}`,
        'NGN',
      );
    });

    it('should throw BadRequestException for unsupported currency', async () => {
      await expect(
        service.initializePayment('user-1', amount, 'EUR'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.initializePayment('user-1', amount, ''),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.initializePayment('user-1', amount, 'XYZ'),
      ).rejects.toThrow('Unsupported currency');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.initializePayment('user-1', amount, currency),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException when PAYSTACK_CALLBACK_URL is not set', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      configService.get.mockReturnValue(undefined);

      await expect(
        service.initializePayment('user-1', amount, currency),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw BadRequestException when Paystack API returns error status', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      configService.get.mockReturnValue('https://example.com/payment/callback');
      transactionsService.createTransaction.mockResolvedValue(mockTransaction);
      paystackService.initializeTransaction.mockResolvedValue({
        status: false,
        message: 'Invalid amount',
      });

      await expect(
        service.initializePayment('user-1', amount, currency),
      ).rejects.toThrow(BadRequestException);
    });

    it('should mark pending transaction as failed when Paystack init throws', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      configService.get.mockReturnValue('https://example.com/payment/callback');
      transactionsService.createTransaction.mockResolvedValue(mockTransaction);
      paystackService.initializeTransaction.mockRejectedValue(
        new Error('Paystack API unreachable'),
      );

      await expect(
        service.initializePayment('user-1', amount, currency),
      ).rejects.toThrow(BadRequestException);

      expect(
        transactionsService.transactionsRepository.save,
      ).toHaveBeenCalledWith({
        ...mockTransaction,
        status: TransactionStatus.FAILED,
      });
    });

    it('should use KES specific amount rounding for KES currency', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      configService.get.mockReturnValue('https://example.com/payment/callback');
      transactionsService.createTransaction.mockResolvedValue(mockTransaction);
      paystackService.initializeTransaction.mockResolvedValue({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/abc',
          access_code: 'abc',
          reference: 'ref',
        },
      });

      await service.initializePayment('user-1', 500, 'KES');

      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        mockUser.email,
        500,
        expect.any(String),
        'KES',
      );
    });
  });

  describe('initiateWithdrawal', () => {
    const withdrawalUser = {
      id: 'user-1',
      email: 'player@test.com',
      allowWithdrawals: true,
      withdrawalCurrency: 'USD',
      dailyWithdrawalLimit: 5000,
      monthlyWithdrawalLimit: 100000,
      monthlyWithdrawalTotal: 0,
      accountVerified: true,
      bankCode: '058',
      accountNumber: '0123456789',
      accountHolderName: 'John Doe',
      paystackRecipientCode: 'RCP_test',
      consecutiveWithdrawalFailures: 0,
      wallet: { balance: 10000 },
    };

    it('should deduct coins and initiate transfer for a valid bank withdrawal', async () => {
      userRepository.findOne.mockResolvedValue(withdrawalUser);
      transactionsService.transactionsRepository.find.mockResolvedValue([]);
      paystackService.initiateTransfer.mockResolvedValue({
        status: true,
        data: {},
      });
      paystackService.getTransferFee.mockResolvedValue(200);

      const result = await service.initiateWithdrawal('user-1', {
        coins: 5000,
        withdrawalMethod: WithdrawalMethod.BANK_TRANSFER,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('pending');
      expect(result.reference).toBeDefined();
      expect(result.coins).toBe(5000);
      expect(paystackService.initiateTransfer).toHaveBeenCalledWith(
        'RCP_test',
        5000, // 5000 coins * $0.01 = $50 -> 5000 cents
        expect.any(String),
        expect.stringContaining('withdrawal_'),
      );
      // coins deducted
      expect(walletRepository.save).toHaveBeenCalledWith({
        ...withdrawalUser.wallet,
        balance: 5000,
      });
      expect(transactionsService.createTransaction).toHaveBeenCalledWith(
        withdrawalUser,
        5000,
        expect.any(String),
        TransactionStatus.PENDING,
        TransactionType.WITHDRAWAL,
      );
    });

    it('should throw when balance is insufficient', async () => {
      userRepository.findOne.mockResolvedValue({
        ...withdrawalUser,
        wallet: { balance: 100 },
      });

      await expect(
        service.initiateWithdrawal('user-1', {
          coins: 5000,
          withdrawalMethod: WithdrawalMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when bank details are missing', async () => {
      userRepository.findOne.mockResolvedValue({
        ...withdrawalUser,
        bankCode: null,
        accountNumber: null,
        accountHolderName: null,
        paystackRecipientCode: null,
      });
      transactionsService.transactionsRepository.find.mockResolvedValue([]);

      await expect(
        service.initiateWithdrawal('user-1', {
          coins: 1000,
          withdrawalMethod: WithdrawalMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow('Bank details are required');
    });

    it('should throw when withdrawals are disabled', async () => {
      userRepository.findOne.mockResolvedValue({
        ...withdrawalUser,
        allowWithdrawals: false,
      });

      await expect(
        service.initiateWithdrawal('user-1', {
          coins: 1000,
          withdrawalMethod: WithdrawalMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw when daily limit is exceeded', async () => {
      userRepository.findOne.mockResolvedValue(withdrawalUser);
      transactionsService.transactionsRepository.find.mockResolvedValue([
        { amount: 4500, status: TransactionStatus.SUCCESS },
      ]);

      await expect(
        service.initiateWithdrawal('user-1', {
          coins: 1000,
          withdrawalMethod: WithdrawalMethod.BANK_TRANSFER,
        }),
      ).rejects.toThrow('Daily withdrawal limit exceeded');
    });
  });

  describe('handleWithdrawalWebhook', () => {
    it('should refund coins and mark transaction failed on transfer.failed', async () => {
      const tx = {
        id: 'tx-1',
        reference: 'withdrawal_1',
        amount: 5000,
        status: TransactionStatus.PENDING,
        type: TransactionType.WITHDRAWAL,
        user: { id: 'user-1' },
      };

      transactionsService.transactionsRepository.findOne.mockResolvedValue(tx);
      transactionsService.updateTransactionStatus = jest
        .fn()
        .mockResolvedValue(tx);
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        monthlyWithdrawalTotal: 5000,
        consecutiveWithdrawalFailures: 0,
      });
      walletRepository.findOne.mockResolvedValue({
        user: { id: 'user-1' },
        balance: 0,
      });
      walletRepository.save.mockResolvedValue({});

      await service.handleWithdrawalWebhook('withdrawal_1', 'failed');

      expect(walletRepository.save).toHaveBeenCalledWith({
        user: { id: 'user-1' },
        balance: 5000,
      });
      expect(userRepository.save).toHaveBeenCalledWith({
        id: 'user-1',
        monthlyWithdrawalTotal: 0,
        consecutiveWithdrawalFailures: 1,
      });
    });
  });
});
