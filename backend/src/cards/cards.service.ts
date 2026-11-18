import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager, In, LessThan } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.decorators';
import { CardStatus, DepartmentStatus, Role } from '../common/enums';
import { isFinance } from '../common/scope';
import { Department } from '../departments/department.entity';
import { User } from '../users/user.entity';
import { CardRulesValidator } from './card-rules.validator';
import { CardRuleHistory, CardStatusHistory } from './card-history.entities';
import { CardRulesDto, IssueCardDto } from './cards.dto';
import { CardFactory } from './patterns/card.factory';
import { CardAction, nextStatus } from './patterns/card-state';
import { generateCvv, generatePan } from './patterns/luhn';
import { VirtualCard } from './virtual-card.entity';

const LIVE = [CardStatus.ACTIVE, CardStatus.FROZEN];

/** F5 Issuance, F6 Rules, F7 Lifecycle (business logic). */
@Injectable()
export class CardsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CardsService.name);
  private expiryTimer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly factory: CardFactory,
    private readonly rulesValidator: CardRulesValidator,
    private readonly audit: AuditService,
  ) {}

  // ================= F5 – issuance =================

  async issue(actor: AuthUser, dto: IssueCardDto) {
    if (actor.role === Role.EMPLOYEE) throw new ForbiddenException('Employees cannot issue cards');

    return this.dataSource.transaction(async (m) => {
      const holder = await m.findOneBy(User, { id: dto.holderId, tenantId: actor.tenantId });
      if (!holder) throw new NotFoundException('Card holder not found');
      if (!holder.isActive) throw new BadRequestException('Card holder is deactivated');
      if (!holder.departmentId) throw new BadRequestException('Card holder must belong to a department; the card is paid from that department\'s wallet');
      if (!isFinance(actor) && holder.departmentId !== actor.departmentId) {
        throw new ForbiddenException('You can only issue cards to people in your own department');
      }
      const dept = await m.findOneByOrFail(Department, { id: holder.departmentId });
      if (dept.status !== DepartmentStatus.ACTIVE) throw new BadRequestException('Department is archived');

      // DESIGN PATTERN – Factory: the type decides defaults and mandatory rules.
      const blueprint = this.factory.create(dto.type, { rules: dto.rules as any, amount: dto.amount, merchantName: dto.merchantName });
      const rules = this.rulesValidator.validate(dto.type, blueprint.rules);

      const pan = await this.uniquePan(m);
      const cvv = generateCvv();
      const card = await m.save(
        m.create(VirtualCard, {
          tenantId: actor.tenantId,
          departmentId: dept.id,
          holderId: holder.id,
          nickname: dto.nickname.trim(),
          type: blueprint.type,
          pan,
          last4: pan.slice(-4),
          cvvHash: await bcrypt.hash(cvv, 10),
          expiryMonth: blueprint.expiryMonth,
          expiryYear: blueprint.expiryYear,
          expiresAt: blueprint.expiresAt,
          status: CardStatus.ACTIVE,
          rules,
          issuedById: actor.userId,
        }),
      );
      await m.insert(CardStatusHistory, { tenantId: actor.tenantId, cardId: card.id, fromStatus: null, toStatus: CardStatus.ACTIVE, reason: 'Issued', actorId: actor.userId });
      await m.insert(CardRuleHistory, { tenantId: actor.tenantId, cardId: card.id, oldRules: null, newRules: rules, changedById: actor.userId });
      await this.audit.log({ tenantId: actor.tenantId, actorId: actor.userId, action: 'CARD_ISSUED', entityType: 'VirtualCard', entityId: card.id, details: { type: card.type, holder: holder.email, last4: card.last4 } }, m);

      // Full number + CVV are returned exactly once; the CVV cannot be recovered afterwards.
      return {
        card: this.toView(card),
        secrets: { pan, cvv, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear },
      };
    });
  }

  async list(actor: AuthUser, filter: { status?: CardStatus; departmentId?: string; holderId?: string }) {
    const params: unknown[] = [actor.tenantId];
    const where = ['c.tenant_id = $1'];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };

    if (actor.role === Role.EMPLOYEE) add('c.holder_id = ?', actor.userId);
    else if (actor.role === Role.DEPARTMENT_MANAGER) add('c.department_id = ?', actor.departmentId);
    if (filter.status) add('c.status = ?', filter.status);
    if (filter.departmentId) add('c.department_id = ?', filter.departmentId);
    if (filter.holderId) add('c.holder_id = ?', filter.holderId);

    return this.dataSource.query(
      `SELECT c.id, c.nickname, c.type, c.last4, c.status, c.expiry_month AS "expiryMonth", c.expiry_year AS "expiryYear",
              c.expires_at AS "expiresAt", c.rules, c.created_at AS "createdAt",
              c.holder_id AS "holderId", u.name AS "holderName", c.department_id AS "departmentId", d.name AS "departmentName",
              COALESCE((SELECT SUM(t.amount) FROM card_transactions t
                         WHERE t.card_id = c.id AND t.status = 'APPROVED'
                           AND t.created_at >= date_trunc('month', now() AT TIME ZONE tn.timezone) AT TIME ZONE tn.timezone), 0)::float AS "spentThisMonth"
         FROM virtual_cards c
         JOIN users u ON u.id = c.holder_id
         JOIN departments d ON d.id = c.department_id
         JOIN tenants tn ON tn.id = c.tenant_id
        WHERE ${where.join(' AND ')}
        ORDER BY (c.status = 'ACTIVE') DESC, c.created_at DESC`,
      params,
    );
  }

  async get(actor: AuthUser, id: string) {
    const card = await this.findInScope(this.dataSource.manager, actor, id);
    const spend = await this.spendSummary(this.dataSource.manager, card.id, actor.tenantId);
    const holder = await this.dataSource.manager.findOneBy(User, { id: card.holderId });
    const dept = await this.dataSource.manager.findOneBy(Department, { id: card.departmentId });
    return { ...this.toView(card), holderName: holder?.name, departmentName: dept?.name, spend };
  }

  /** Full number for the holder (to pay with) or for finance/manager – every reveal is audited. */
  async reveal(actor: AuthUser, id: string) {
    const card = await this.findInScope(this.dataSource.manager, actor, id, false, true);
    if (!LIVE.includes(card.status)) throw new BadRequestException(`The card is ${card.status}`);
    await this.audit.log({ tenantId: actor.tenantId, actorId: actor.userId, action: 'CARD_NUMBER_REVEALED', entityType: 'VirtualCard', entityId: id });
    return { pan: card.pan, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear };
  }

  // ================= F6 – rules =================

  async updateRules(actor: AuthUser, id: string, dto: CardRulesDto) {
    if (actor.role === Role.EMPLOYEE) throw new ForbiddenException('Employees cannot change card rules');
    return this.dataSource.transaction(async (m) => {
      const card = await this.findInScope(m, actor, id, true);
      if (!LIVE.includes(card.status)) throw new BadRequestException(`Rules of a ${card.status} card cannot be changed`);
      const rules = this.rulesValidator.validate(card.type, dto as any);
      const oldRules = card.rules;
      card.rules = rules;
      await m.save(card);
      await m.insert(CardRuleHistory, { tenantId: actor.tenantId, cardId: id, oldRules, newRules: rules, changedById: actor.userId });
      await this.audit.log({ tenantId: actor.tenantId, actorId: actor.userId, action: 'CARD_RULES_CHANGED', entityType: 'VirtualCard', entityId: id, details: { oldRules, newRules: rules } }, m);
      return this.toView(card);
    });
  }

  async ruleHistory(actor: AuthUser, id: string) {
    await this.findInScope(this.dataSource.manager, actor, id);
    return this.dataSource.query(
      `SELECT h.id, h.old_rules AS "oldRules", h.new_rules AS "newRules", h.created_at AS "createdAt", u.name AS "changedBy"
         FROM card_rule_history h JOIN users u ON u.id = h.changed_by_id
        WHERE h.card_id = $1 ORDER BY h.created_at DESC`,
      [id],
    );
  }

  // ================= F7 – lifecycle (State pattern) =================

  async changeStatus(actor: AuthUser, id: string, action: 'freeze' | 'unfreeze' | 'terminate', reason?: string) {
    return this.dataSource.transaction(async (m) => {
      const card = await this.findInScope(m, actor, id, true);
      const isHolder = card.holderId === actor.userId;

      // Who may do what (RBAC on top of the state machine):
      if (action === 'unfreeze' && (isHolder || actor.role === Role.EMPLOYEE) && !isFinance(actor)) {
        throw new ForbiddenException('A card holder cannot unfreeze their own card; ask your manager or finance');
      }
      if (action === 'terminate') {
        if (actor.role === Role.EMPLOYEE) throw new ForbiddenException('Only managers and finance can terminate cards');
        if (!reason || reason.trim().length < 3) throw new BadRequestException('A reason is required to terminate a card');
      }
      await this.applyTransition(m, card, action, actor.userId, reason ?? null);
      return this.toView(card);
    });
  }

  async statusHistory(actor: AuthUser, id: string) {
    await this.findInScope(this.dataSource.manager, actor, id);
    return this.dataSource.query(
      `SELECT h.id, h.from_status AS "fromStatus", h.to_status AS "toStatus", h.reason, h.created_at AS "createdAt",
              COALESCE(u.name, 'System') AS actor
         FROM card_status_history h LEFT JOIN users u ON u.id = h.actor_id
        WHERE h.card_id = $1 ORDER BY h.created_at DESC`,
      [id],
    );
  }

  /** The single place where a card's status changes. actorId = null for system actions (burn, expire). */
  async applyTransition(m: EntityManager, card: VirtualCard, action: CardAction, actorId: string | null, reason: string | null) {
    const from = card.status;
    const to = nextStatus(from, action); // throws 400 on an illegal transition
    card.status = to;
    await m.update(VirtualCard, { id: card.id }, { status: to });
    await m.insert(CardStatusHistory, { tenantId: card.tenantId, cardId: card.id, fromStatus: from, toStatus: to, reason, actorId });
    await this.audit.log({ tenantId: card.tenantId, actorId, action: `CARD_${to}`, entityType: 'VirtualCard', entityId: card.id, details: { from, to, reason } }, m);
  }

  /** Used by F3: deactivating an employee freezes all their ACTIVE cards. */
  async freezeAllCardsOfHolder(m: EntityManager, actor: AuthUser, holderId: string, reason: string): Promise<number> {
    const cards = await m.find(VirtualCard, { where: { holderId, status: CardStatus.ACTIVE }, lock: { mode: 'pessimistic_write' } });
    for (const card of cards) await this.applyTransition(m, card, 'freeze', actor.userId, reason);
    return cards.length;
  }

  countLiveCardsOfHolder(m: EntityManager, holderId: string) {
    return m.count(VirtualCard, { where: { holderId, status: In(LIVE) } });
  }

  /** Background job: expire cards whose expiry date has passed (the authorization engine also checks at charge time). */
  async expireOverdueCards(): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      const cards = await m.find(VirtualCard, { where: { status: In(LIVE), expiresAt: LessThan(new Date()) }, lock: { mode: 'pessimistic_write' } });
      for (const card of cards) await this.applyTransition(m, card, 'expire', null, 'Expiry date passed');
      return cards.length;
    });
  }

  onApplicationBootstrap() {
    const run = () => this.expireOverdueCards().then((n) => n && this.logger.log(`Expired ${n} card(s)`)).catch((e) => this.logger.error(e));
    run();
    this.expiryTimer = setInterval(run, 60 * 60 * 1000);
  }

  onApplicationShutdown() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  // ================= helpers =================

  /** Spend of APPROVED charges today / this month (company timezone) / ever. Also used by F8. */
  async spendSummary(m: EntityManager, cardId: string, tenantId: string) {
    const [row] = await m.query(
      `SELECT
         COALESCE(SUM(t.amount) FILTER (WHERE t.created_at >= date_trunc('day',   now() AT TIME ZONE tn.timezone) AT TIME ZONE tn.timezone), 0)::float AS today,
         COALESCE(SUM(t.amount) FILTER (WHERE t.created_at >= date_trunc('month', now() AT TIME ZONE tn.timezone) AT TIME ZONE tn.timezone), 0)::float AS "thisMonth",
         COALESCE(SUM(t.amount), 0)::float AS lifetime
       FROM tenants tn
       LEFT JOIN card_transactions t ON t.card_id = $1 AND t.status = 'APPROVED'
       WHERE tn.id = $2
       GROUP BY tn.id`,
      [cardId, tenantId],
    );
    return { today: row?.today ?? 0, thisMonth: row?.thisMonth ?? 0, lifetime: row?.lifetime ?? 0 };
  }

  /**
   * Tenant + role scoping. Anything outside the caller's scope is reported as 404 (not 403),
   * so users cannot even learn that another company's card id exists.
   */
  private async findInScope(m: EntityManager, actor: AuthUser, id: string, lock = false, withPan = false): Promise<VirtualCard> {
    const qb = m.createQueryBuilder(VirtualCard, 'c').where('c.id = :id AND c.tenantId = :t', { id, t: actor.tenantId });
    if (withPan) qb.addSelect('c.pan');
    if (lock) qb.setLock('pessimistic_write');
    const card = await qb.getOne();
    if (!card) throw new NotFoundException('Card not found');
    if (actor.role === Role.EMPLOYEE && card.holderId !== actor.userId) throw new NotFoundException('Card not found');
    if (actor.role === Role.DEPARTMENT_MANAGER && card.departmentId !== actor.departmentId && card.holderId !== actor.userId) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }

  private async uniquePan(m: EntityManager): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const pan = generatePan();
      const exists = await m.createQueryBuilder(VirtualCard, 'c').where('c.pan = :pan', { pan }).getExists();
      if (!exists) return pan;
    }
    throw new Error('Could not generate a unique card number');
  }

  toView(c: VirtualCard) {
    const { pan: _p, cvvHash: _c, ...rest } = c as VirtualCard & { pan?: string; cvvHash?: string };
    return { ...rest, maskedNumber: `•••• •••• •••• ${c.last4}` };
  }
}
