import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
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
  ): Promise<Transaction> {
    const transaction = this.transactionsRepository.create({
      user,
      amount,
      reference,
      status,
      type,
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

  async updateTransactionStatus(reference: string, status: TransactionStatus, amount?: number): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({ where: { reference } });
    if (!transaction) {
      throw new NotFoundException(`Transaction with reference ${reference} not found`);
    }
    transaction.status = status;
    if (amount !== undefined) {
      transaction.amount = amount; // Update amount if provided (e.g., after verification)
    }
    return this.transactionsRepository.save(transaction);
  }
}
