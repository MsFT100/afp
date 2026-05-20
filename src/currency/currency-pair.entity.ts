import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity('currency_pairs')
@Unique(['baseCurrency', 'quoteCurrency'])
export class CurrencyPair {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  baseCurrency!: string; // e.g., 'EUR'

  @Column()
  quoteCurrency!: string; // e.g., 'USD'

  @Column('decimal', { precision: 18, scale: 6 })
  rate!: number;

  @Column()
  name!: string; // e.g., 'Euro / US Dollar'

  @UpdateDateColumn()
  updatedAt!: Date;
}