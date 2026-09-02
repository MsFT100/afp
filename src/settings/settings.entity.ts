import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class Setting {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'text' })
  value: string;
}
