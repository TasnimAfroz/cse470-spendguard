import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Department } from '../departments/department.entity';
import { Tenant } from '../tenants/tenant.entity';
import { WalletType } from '../common/enums';
import { moneyTransformer } from '../common/money';

/**
 * MODEL – a pool of money (F4). Each tenant has exactly one TREASURY wallet
 * and one DEPARTMENT wallet per department ("parent-child sub-wallets").
 * The CHECK constraint is a last line of defence: the database itself refuses a negative balance.
 */
@Entity('wallets')
@Check(`"balance" >= 0`)
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'enum', enum: WalletType })
  type: WalletType;

  @Index({ unique: true, where: 'department_id IS NOT NULL' })
  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: moneyTransformer })
  balance: number;

  @Column({ length: 3, default: 'BDT' })
  currency: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
