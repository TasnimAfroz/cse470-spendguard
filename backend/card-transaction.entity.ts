import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { VirtualCard } from '../cards/virtual-card.entity';
import { DeclineCode, MerchantCategory, TransactionStatus } from '../common/enums';
import { moneyTransformer } from '../common/money';
import { Department } from '../departments/department.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';

export interface CheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

/** MODEL – every authorization attempt, approved or declined (F8). Declines are kept for audit and anomaly detection. */
@Entity('card_transactions')
@Index(['cardId', 'status', 'createdAt'])
export class CardTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  /** Null when the card number did not match any card of this company. */
  @Column({ type: 'uuid', nullable: true })
  cardId: string | null;

  @ManyToOne(() => VirtualCard, { nullable: true })
  @JoinColumn({ name: 'card_id' })
  card?: VirtualCard | null;

  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  @Column({ type: 'uuid', nullable: true })
  holderId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'holder_id' })
  holder?: User | null;

  @Column({ length: 4 })
  cardLast4: string;

  @Column()
  merchantName: string;

  @Column({ type: 'enum', enum: MerchantCategory })
  merchantCategory: MerchantCategory;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: moneyTransformer })
  amount: number;

  @Column({ length: 3, default: 'BDT' })
  currency: string;

  @Column({ type: 'enum', enum: TransactionStatus })
  status: TransactionStatus;

  @Column({ type: 'enum', enum: DeclineCode, nullable: true })
  declineCode: DeclineCode | null;

  @Column({ type: 'varchar', nullable: true })
  declineMessage: string | null;

  /** Pass/fail of each handler in the chain – shown in the simulator and later in F9. */
  @Column({ type: 'jsonb', default: [] })
  checkTrace: CheckResult[];

  /** Who pressed "charge" in the simulator (plays the merchant). */
  @Column('uuid')
  requestedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'requested_by_id' })
  requestedBy?: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
