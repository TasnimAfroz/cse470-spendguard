import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.decorators';
import { DepartmentStatus, LedgerDirection, LedgerKind, WalletType } from '../common/enums';
import { addMoney, subMoney } from '../common/money';
import { assertDepartmentAccess, isFinance } from '../common/scope';
import { Department } from '../departments/department.entity';
import { LedgerEntry } from './ledger-entry.entity';
import { Wallet } from './wallet.entity';
import { DepositDto, TransferDto } from './wallets.dto';

/** F4 – Treasury & Department Wallet Allocation (business logic). */
@Injectable()
export class WalletsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const params: unknown[] = [user.tenantId];
    let where = 'w.tenant_id = $1';
    if (!isFinance(user)) {
      params.push(user.departmentId);
      where += ` AND w.department_id = $2`;
    }
    return this.dataSource.query(
      `SELECT w.id, w.type, w.department_id AS "departmentId", d.name AS "departmentName", d.code AS "departmentCode",
              d.status AS "departmentStatus", w.balance::float AS balance, w.currency, w.updated_at AS "updatedAt"
         FROM wallets w LEFT JOIN departments d ON d.id = w.department_id
        WHERE ${where}
        ORDER BY (w.type = 'TREASURY') DESC, d.name`,
      params,
    );
  }

  async ledger(user: AuthUser, walletId: string, limit = 100) {
    const wallet = await this.dataSource.manager.findOneBy(Wallet, { id: walletId, tenantId: user.tenantId });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.type === WalletType.TREASURY && !isFinance(user)) throw new NotFoundException('Wallet not found');
    if (wallet.type === WalletType.DEPARTMENT) assertDepartmentAccess(user, wallet.departmentId);
    const rows = await this.dataSource.query(
      `SELECT l.id, l.direction, l.kind, l.amount::float AS amount, l.balance_after::float AS "balanceAfter", l.note,
              l.transaction_id AS "transactionId", l.created_at AS "createdAt", u.name AS "createdBy",
              COALESCE(cd.name, CASE WHEN cw.type = 'TREASURY' THEN 'Treasury' END) AS counterparty
         FROM ledger_entries l
         LEFT JOIN users u ON u.id = l.created_by_id
         LEFT JOIN wallets cw ON cw.id = l.counterparty_wallet_id
         LEFT JOIN departments cd ON cd.id = cw.department_id
        WHERE l.wallet_id = $1
        ORDER BY l.created_at DESC
        LIMIT $2`,
      [walletId, Math.min(limit, 500)],
    );
    return { wallet, entries: rows };
  }

  /** Simulated bank top-up into the treasury. */
  async deposit(user: AuthUser, dto: DepositDto) {
    return this.dataSource.transaction(async (m) => {
      const treasury = await this.lockTreasury(m, user.tenantId);
      treasury.balance = addMoney(treasury.balance, dto.amount);
      await m.save(treasury);
      await this.writeLedger(m, treasury, LedgerDirection.CREDIT, LedgerKind.DEPOSIT, dto.amount, null, `Deposit ref ${dto.reference}`, user.userId);
      await this.audit.log({ tenantId: user.tenantId, actorId: user.userId, action: 'TREASURY_DEPOSIT', entityType: 'Wallet', entityId: treasury.id, details: { amount: dto.amount, reference: dto.reference } }, m);
      return treasury;
    });
  }

  /** Treasury -> department. */
  async allocate(user: AuthUser, dto: TransferDto) {
    return this.dataSource.transaction(async (m) => {
      const dept = await this.activeDepartment(m, user, dto.departmentId);
      const [treasury, deptWallet] = await this.lockPair(m, user.tenantId, dept.id);
      await this.move(m, treasury, deptWallet, dto.amount, LedgerKind.ALLOCATION, dto.note ?? `Allocation to ${dept.name}`, user.userId);
      await this.audit.log({ tenantId: user.tenantId, actorId: user.userId, action: 'FUNDS_ALLOCATED', entityType: 'Wallet', entityId: deptWallet.id, details: { department: dept.code, amount: dto.amount } }, m);
      return { treasury, departmentWallet: deptWallet };
    });
  }

  /** Department -> treasury (allowed for archived-to-be departments too). */
  async reclaim(user: AuthUser, dto: TransferDto) {
    return this.dataSource.transaction(async (m) => {
      const dept = await m.findOneBy(Department, { id: dto.departmentId, tenantId: user.tenantId });
      if (!dept) throw new NotFoundException('Department not found');
      const [treasury, deptWallet] = await this.lockPair(m, user.tenantId, dept.id);
      await this.move(m, deptWallet, treasury, dto.amount, LedgerKind.RECLAIM, dto.note ?? `Reclaim from ${dept.name}`, user.userId);
      await this.audit.log({ tenantId: user.tenantId, actorId: user.userId, action: 'FUNDS_RECLAIMED', entityType: 'Wallet', entityId: deptWallet.id, details: { department: dept.code, amount: dto.amount } }, m);
      return { treasury, departmentWallet: deptWallet };
    });
  }

  /**
   * Used by the authorization engine (F8). The caller must already hold the row lock on `wallet`
   * and must have verified the balance; this method only applies the debit and writes the ledger line.
   */
  async debitForCardCharge(m: EntityManager, wallet: Wallet, amount: number, transactionId: string, note: string, actorId: string) {
    if (wallet.balance < amount) throw new BadRequestException('Insufficient funds');
    wallet.balance = subMoney(wallet.balance, amount);
    await m.save(wallet);
    await this.writeLedger(m, wallet, LedgerDirection.DEBIT, LedgerKind.CARD_CHARGE, amount, null, note, actorId, transactionId);
  }

  // ---------- helpers ----------

  /** Double-entry move between two LOCKED wallets. */
  private async move(m: EntityManager, from: Wallet, to: Wallet, amount: number, kind: LedgerKind, note: string, actorId: string) {
    if (from.balance < amount) {
      throw new BadRequestException(`Insufficient balance: available ${from.balance.toFixed(2)} ${from.currency}, requested ${amount.toFixed(2)}`);
    }
    from.balance = subMoney(from.balance, amount);
    to.balance = addMoney(to.balance, amount);
    await m.save([from, to]);
    await this.writeLedger(m, from, LedgerDirection.DEBIT, kind, amount, to.id, note, actorId);
    await this.writeLedger(m, to, LedgerDirection.CREDIT, kind, amount, from.id, note, actorId);
  }

  private writeLedger(
    m: EntityManager, wallet: Wallet, direction: LedgerDirection, kind: LedgerKind, amount: number,
    counterpartyWalletId: string | null, note: string, actorId: string | null, transactionId: string | null = null,
  ) {
    return m.insert(LedgerEntry, {
      tenantId: wallet.tenantId, walletId: wallet.id, direction, kind, amount, balanceAfter: wallet.balance,
      counterpartyWalletId, note, createdById: actorId, transactionId,
    });
  }

  private async lockTreasury(m: EntityManager, tenantId: string): Promise<Wallet> {
    const w = await m.findOne(Wallet, { where: { tenantId, type: WalletType.TREASURY }, lock: { mode: 'pessimistic_write' } });
    if (!w) throw new NotFoundException('Treasury wallet missing');
    return w;
  }

  /** Locks treasury + department wallet in a fixed order (by id) so two concurrent transfers can never deadlock. */
  private async lockPair(m: EntityManager, tenantId: string, departmentId: string): Promise<[Wallet, Wallet]> {
    const rows = await m
      .createQueryBuilder(Wallet, 'w')
      .where('w.tenantId = :t', { t: tenantId })
      .andWhere('(w.type = :tr OR w.departmentId = :d)', { tr: WalletType.TREASURY, d: departmentId })
      .orderBy('w.id')
      .setLock('pessimistic_write')
      .getMany();
    const treasury = rows.find((w) => w.type === WalletType.TREASURY);
    const dept = rows.find((w) => w.departmentId === departmentId);
    if (!treasury || !dept) throw new NotFoundException('Wallet not found');
    return [treasury, dept];
  }

  private async activeDepartment(m: EntityManager, user: AuthUser, id: string) {
    const dept = await m.findOneBy(Department, { id, tenantId: user.tenantId });
    if (!dept) throw new NotFoundException('Department not found');
    if (dept.status !== DepartmentStatus.ACTIVE) throw new BadRequestException('Cannot allocate money to an archived department');
    return dept;
  }
}
