import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CardTransaction } from '../authorization/card-transaction.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { Wallet } from './wallet.entity';
import { LedgerDirection, LedgerKind } from '../common/enums';
import { moneyTransformer } from '../common/money';

/**
 * MODEL – one line in a wallet's ledger (F4). Every money movement writes
 * matching DEBIT and CREDIT lines (double-entry), so balances can always be re-computed and audited.
 */
@Entity('ledger_entries')
@Index(['walletId', 'createdAt'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column('uuid')
  walletId: string;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet?: Wallet;

  @Column({ type: 'enum', enum: LedgerDirection })
  direction: LedgerDirection;

  @Column({ type: 'enum', enum: LedgerKind })
  kind: LedgerKind;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: moneyTransformer })
  amount: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: moneyTransformer })
  balanceAfter: number;

  /** The other wallet in a transfer (null for deposits and card charges). */
  @Column({ type: 'uuid', nullable: true })
  counterpartyWalletId: string | null;

  @ManyToOne(() => Wallet, { nullable: true })
  @JoinColumn({ name: 'counterparty_wallet_id' })
  counterpartyWallet?: Wallet | null;

  /** Set for CARD_CHARGE lines – links to card_transactions. */
  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @ManyToOne(() => CardTransaction, { nullable: true })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: CardTransaction | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
