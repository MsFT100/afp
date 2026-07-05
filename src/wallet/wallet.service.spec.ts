import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { WalletsService } from './wallet.service';
import { Wallet } from './wallet.entity';
import { User } from '../users/user.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { PaystackService } from '../paystack/paystack.service';
import { PayPalService } from '../paypal/paypal.service';
import { ConfigService } from '@nestjs/config';
import { TransactionStatus, TransactionType } from '../transactions/transaction.entity';

describe('WalletsService', () => {
  let service: WalletsService;
  let userRepository: any;
  let paystackService: any;
  let configService: any;
  let transactionsService: any;

  const mockUser = { id: 'user-1', email: 'player@test.com' } as User;
  const mockTransaction = {
    id: 'tx-1',
    reference: 'paystack_init_1234567890',
    status: TransactionStatus.PENDING,
  };

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
    };

    paystackService = {
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
    };

    configService = {
      get: jest.fn(),
    };

    transactionsService = {
      createTransaction: jest.fn(),
      transactionsRepository: {
        save: jest.fn(),
        findOne: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: getRepositoryToken(Wallet), useValue: { findOne: jest.fn(), save: jest.fn(), create: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: userRepository },
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

      const result = await service.initializePayment('user-1', amount, currency);

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
      await expect(service.initializePayment('user-1', amount, 'EUR'))
        .rejects.toThrow(BadRequestException);

      await expect(service.initializePayment('user-1', amount, ''))
        .rejects.toThrow(BadRequestException);

      await expect(service.initializePayment('user-1', amount, 'XYZ'))
        .rejects.toThrow('Unsupported currency');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.initializePayment('user-1', amount, currency))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException when PAYSTACK_CALLBACK_URL is not set', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      configService.get.mockReturnValue(undefined);

      await expect(service.initializePayment('user-1', amount, currency))
        .rejects.toThrow(InternalServerErrorException);
    });

    it('should throw BadRequestException when Paystack API returns error status', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      configService.get.mockReturnValue('https://example.com/payment/callback');
      transactionsService.createTransaction.mockResolvedValue(mockTransaction);
      paystackService.initializeTransaction.mockResolvedValue({
        status: false,
        message: 'Invalid amount',
      });

      await expect(service.initializePayment('user-1', amount, currency))
        .rejects.toThrow(BadRequestException);
    });

    it('should mark pending transaction as failed when Paystack init throws', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      configService.get.mockReturnValue('https://example.com/payment/callback');
      transactionsService.createTransaction.mockResolvedValue(mockTransaction);
      paystackService.initializeTransaction.mockRejectedValue(new Error('Paystack API unreachable'));

      await expect(service.initializePayment('user-1', amount, currency))
        .rejects.toThrow(BadRequestException);

      expect(transactionsService.transactionsRepository.save).toHaveBeenCalledWith({
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
});
