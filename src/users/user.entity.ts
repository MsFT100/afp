import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Wallet } from '../wallet/wallet.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Avatar } from '../avatars/avatar.entity';
import { Cue } from '../cues/cue.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  PROMOTER = 'PROMOTER',
  SUPPORT = 'SUPPORT',
  PLAYER = 'PLAYER',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column()
  displayName!: string;

  @Column()
  phoneNumber!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.SUPPORT })
  role!: UserRole;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: () => "\"'0'\"" })
  ownedCues!: string;

  @Column({ default: "" })
  ownedChats!: string;

  @Column({ default: "" })
  ownedAvatars!: string;

  @Column({ nullable: true })
  activeAvatarId!: string;

  @ManyToOne(() => Avatar)
  @JoinColumn({ name: 'activeAvatarId' })
  activeAvatar!: Avatar;

  @Column({ nullable: true })
  activeCueId!: string;

  @ManyToOne(() => Cue)
  @JoinColumn({ name: 'activeCueId' })
  activeCue!: Cue;

  @Column({ default: () => "\"'0';'0';'0';'0'\"" })
  usedCue!: string;

  @Column({ default: false })
  ownEmojiPack!: boolean;

  @Column({ unique: true, nullable: true })
  promoCode?: string;

  @ManyToOne(() => User, (user) => user.referredUsers, { nullable: true })
  referredBy?: User;

  @OneToMany(() => User, (user) => user.referredBy)
  referredUsers?: User[];

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet!: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions!: Transaction[];
}
