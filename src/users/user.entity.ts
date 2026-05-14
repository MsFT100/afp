import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Wallet } from '../wallet/wallet.entity';
import { Transaction } from '../transactions/transaction.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  PROMOTER = 'PROMOTER',
  SUPPORT = 'SUPPORT',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  displayName: string;

  @Column()
  phoneNumber: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.SUPPORT })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ unique: true, nullable: true })
  promoCode?: string;

  @ManyToOne(() => User, (user) => user.referredUsers, { nullable: true })
  referredBy?: User;

  @OneToMany(() => User, (user) => user.referredBy)
  referredUsers?: User[];

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Transaction[];
}
