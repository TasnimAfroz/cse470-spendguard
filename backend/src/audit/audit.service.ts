import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  tenantId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

const GENESIS = '0'.repeat(64);

@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Appends a hash-chained audit entry. Pass the EntityManager of the surrounding
   * transaction so the audit row is saved (or rolled back) together with the business change.
   */
  async log(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    if (!manager) {
      return this.dataSource.transaction((m) => this.log(entry, m));
    }
    // Serialise writers of the same tenant so the chain never forks.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [entry.tenantId]);
    const last = await manager.findOne(AuditLog, {
      where: { tenantId: entry.tenantId },
      order: { seq: 'DESC' },
    });
    const prevHash = last?.hash ?? GENESIS;
    const createdAt = new Date();
    const details = entry.details ?? {};
    const hash = createHash('sha256')
      .update(
        [prevHash, entry.tenantId, entry.actorId ?? '', entry.action, entry.entityType, entry.entityId ?? '', JSON.stringify(details), createdAt.toISOString()].join('|'),
      )
      .digest('hex');

    await manager.insert(AuditLog, {
      tenantId: entry.tenantId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: details as any,
      prevHash,
      hash,
      createdAt,
    });
  }
}
