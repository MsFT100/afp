import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum Rarity {
  BASIC = 'basic',
  PREMIUM = 'premium',
  LEGEND = 'legend',
}

@Entity()
export class Cue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  imageUrl!: string;

  @Column()
  publicId!: string; // Add this line

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price!: number;

  @Column({ type: 'enum', enum: Rarity, default: Rarity.BASIC })
  rarity!: Rarity;

  @Column({ default: 0 })
  power!: number;

  @Column({ default: 0 })
  aim!: number;

  @Column({ default: 0 })
  time!: number;

  @Column({ default: false })
  isPublished!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}