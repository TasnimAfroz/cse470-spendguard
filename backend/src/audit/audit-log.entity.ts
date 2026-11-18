import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

/**
 * MODEL – append-only audit log. Each row stores the hash of the previous row of the same tenant,
 * forming a hash chain (foundation for F22, whose viewer + verification come in Sprint 4).
 */
@Entity('audit_logs')
@Index(['tenantId', 'seq'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  seq: string;

  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column({ type: 'varchar', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', default: {} })
  details: Record<string, unknown>;

  @Column({ length: 64 })
  prevHash: string;

  @Column({ length: 64 })
  hash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
