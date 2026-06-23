import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

export enum FriendStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  BLOCKED = 'blocked',
}

@Entity('friends')
@Unique(['playerId', 'friendId'])
export class Friend {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'player_id' })
  playerId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'player_id' })
  player!: User;

  @Column({ name: 'friend_id' })
  friendId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'friend_id' })
  friend!: User;

  @Column({
    type: 'enum',
    enum: FriendStatus,
    default: FriendStatus.ACCEPTED,
  })
  status!: FriendStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
