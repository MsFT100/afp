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
  PAYPAL_DEPOSIT = 'paypal_deposit', // Add this line
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

  @CreateDateColumn()
  createdAt: Date = new Date();
}
