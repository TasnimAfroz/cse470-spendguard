import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CardStatus, CardType } from '../common/enums';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { Department } from '../departments/department.entity';
import { CardRules } from './card-rules';

/** MODEL – a virtual card (F5, F6, F7). Charges are paid from the department's wallet. */
@Entity('virtual_cards')
export class VirtualCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column('uuid')
  departmentId: string;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department?: Department;

  @Column('uuid')
  holderId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'holder_id' })
  holder?: User;

  @Column()
  nickname: string;

  @Column({ type: 'enum', enum: CardType })
  type: CardType;

  /** Full 16-digit number. Never sent to the browser except through the audited /reveal endpoint. */
  @Column({ length: 16, unique: true, select: false })
  pan: string;

  @Column({ length: 4 })
  last4: string;

  /** bcrypt hash – the plain CVV is shown only once, at issuance. */
  @Column({ select: false })
  cvvHash: string;

  @Column('int')
  expiryMonth: number;

  @Column('int')
  expiryYear: number;

  /** Exact moment the card stops working (end of the expiry month, or 30 days for single-use). */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'enum', enum: CardStatus, default: CardStatus.ACTIVE })
  status: CardStatus;

  @Column({ type: 'jsonb', default: {} })
  rules: CardRules;

  @Column('uuid')
  issuedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'issued_by_id' })
  issuedBy?: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
