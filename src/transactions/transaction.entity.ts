import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  PURCHASE = 'purchase',
  PAYPAL_DEPOSIT = 'paypal_deposit',
  TABLE_FEE = 'table_fee',
  MATCH_WIN = 'match_win',
}

export enum TransactionDirection {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, (user) => user.transactions)
  user!: User;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ unique: true })
  reference!: string; // Paystack transaction reference

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionDirection,
    nullable: true,
  })
  direction?: TransactionDirection;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  balanceBefore?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  balanceAfter?: number;

  @CreateDateColumn()
  createdAt: Date = new Date();
}
