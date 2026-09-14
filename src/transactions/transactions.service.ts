import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
} from './transaction.entity';
import { User } from '../users/user.entity';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    public transactionsRepository: Repository<Transaction>,
  ) {}

  async createTransaction(
    user: User,
    amount: number,
    reference: string,
    status: TransactionStatus,
    type: TransactionType,
    direction?: TransactionDirection,
    balanceBefore?: number,
    balanceAfter?: number,
  ): Promise<Transaction> {
    const transaction = this.transactionsRepository.create({
      user,
      amount,
      reference,
      status,
      type,
      direction,
      balanceBefore,
      balanceAfter,
    });
    return this.transactionsRepository.save(transaction);
  }

  async findRecentTransactions(limit: number = 50): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['user'], // Load user data along with transactions
    });
  }

  async findUserTransactions(
    userId: string,
    page = 1,
    limit = 50,
  ): Promise<{
    data: Transaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const [data, total] = await this.transactionsRepository.findAndCount({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateTransactionStatus(
    reference: string,
    status: TransactionStatus,
    amount?: number,
    balanceAfter?: number,
  ): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { reference },
    });
    if (!transaction) {
      throw new NotFoundException(
        `Transaction with reference ${reference} not found`,
      );
    }
    transaction.status = status;
    if (amount !== undefined) {
      transaction.amount = amount; // Update amount if provided (e.g., after verification)
    }
    if (balanceAfter !== undefined) {
      transaction.balanceAfter = balanceAfter;
    }
    return this.transactionsRepository.save(transaction);
  }
}
