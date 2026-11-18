import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CardStatus } from '../common/enums';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { CardRules } from './card-rules';
import { VirtualCard } from './virtual-card.entity';

/** MODEL – every version of a card's rules (F6). */
@Entity('card_rule_history')
export class CardRuleHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Index()
  @Column('uuid')
  cardId: string;

  @ManyToOne(() => VirtualCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card?: VirtualCard;

  @Column({ type: 'jsonb', nullable: true })
  oldRules: CardRules | null;

  @Column({ type: 'jsonb' })
  newRules: CardRules;

  @Column('uuid')
  changedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'changed_by_id' })
  changedBy?: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** MODEL – every status change of a card (F7). actorId = null means the system did it. */
@Entity('card_status_history')
export class CardStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Index()
  @Column('uuid')
  cardId: string;

  @ManyToOne(() => VirtualCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'card_id' })
  card?: VirtualCard;

  @Column({ type: 'enum', enum: CardStatus, nullable: true })
  fromStatus: CardStatus | null;

  @Column({ type: 'enum', enum: CardStatus })
  toStatus: CardStatus;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
