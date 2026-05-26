import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToMany, JoinTable, ManyToOne } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id: string = '';

  @Column()
  tableName: string = 'default';

  @Column('decimal', { precision: 10, scale: 2 })
  entryCoins: number = 0;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  winAmount: number = 0;

  @Column({ comment: 'Duration in seconds' })
  duration: number = 0;

  @Column({ nullable: true })
  countryCode?: string;

  @ManyToMany(() => User)
  @JoinTable()
  players!: User[];

  @ManyToOne(() => User)
  winner!: User;

  @ManyToOne(() => User, { nullable: true })
  loser?: User;

  @Column({ type: 'json', nullable: true })
  metadata: any; // For the "Etc" metrics like game-specific events

  @CreateDateColumn()
  timestamp: Date = new Date();
}