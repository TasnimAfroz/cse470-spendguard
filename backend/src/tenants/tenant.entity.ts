import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** MODEL – one row per registered company (F1). Every other table points back here through tenant_id. */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ length: 3, default: 'BDT' })
  baseCurrency: string;

  /** IANA timezone used for card time-window rules and daily/monthly limits. */
  @Column({ default: 'Asia/Dhaka' })
  timezone: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
