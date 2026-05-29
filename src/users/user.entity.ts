import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
  CreateDateColumn,
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

  @Column({ type: 'varchar', unique: true, nullable: true })
  playfabId?: string | null;

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

  @Column({ type: 'varchar', nullable: true })
  deactivationReason?: string | null;

  @Column({ default: () => "\"'0'\"" })
  ownedCues!: string;

  @Column({ default: "" })
  ownedChats!: string;

  @Column({ default: "" })
  ownedAvatars!: string;

  @Column({ type: 'varchar', nullable: true })
  activeAvatarId?: string | null;

  @ManyToOne(() => Avatar)
  @JoinColumn({ name: 'activeAvatarId' })
  activeAvatar!: Avatar;

  @Column({ type: 'varchar', nullable: true })
  activeCueId?: string | null;

  @ManyToOne(() => Cue)
  @JoinColumn({ name: 'activeCueId' })
  activeCue!: Cue;

  @Column({ default: () => "\"'0';'0';'0';'0'\"" })
  usedCue!: string;

  @Column({ default: 0 })
  gamesWon!: number;

  @Column({ default: 0 })
  gamesLost!: number;

  @Column({ default: 0 })
  gamesPlayed!: number;

  @Column({ default: false })
  ownEmojiPack!: boolean;

  @Column({ type: 'varchar', name: 'country_code', nullable: true })
  countryCode?: string | null;

  @Column({ type: 'varchar', nullable: true })
  region?: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  promoCode?: string | null;

  @ManyToOne(() => User, (user) => user.referredUsers, { nullable: true })
  referredBy?: User;

  @OneToMany(() => User, (user) => user.referredBy)
  referredUsers?: User[];

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet!: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions!: Transaction[];

  @Column({ type: 'varchar', nullable: true })
  resetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetTokenExpiry?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
