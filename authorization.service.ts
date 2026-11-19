import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CardsService } from '../cards/cards.service';
import { AuthUser } from '../common/auth.decorators';
import { CardType, Role, TransactionStatus } from '../common/enums';
import { WalletsService } from '../wallets/wallets.service';
import { ChargeDto } from './authorization.dto';
import { CardTransaction, CheckResult } from './card-transaction.entity';
import { AuthorizationContext, AuthorizationHandler, Decision } from './handlers/authorization-handler';
import {
  CardDetailsHandler, CardExistsHandler, CardStatusHandler, DepartmentFundsHandler, MerchantCategoryHandler,
  MerchantLockHandler, PeriodLimitHandler, TimeWindowHandler, TransactionLimitHandler,
} from './handlers/handlers';

/** F8 – Real-Time Authorization Engine. */
@Injectable()
export class AuthorizationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cards: CardsService,
    private readonly wallets: WalletsService,
    private readonly audit: AuditService,
  ) {}

  /** Builds the chain in the order the checks must run. Cheap checks first, money last. */
  private buildChain(): AuthorizationHandler {
    const head = new CardExistsHandler();
    head
      .setNext(new CardDetailsHandler())
      .setNext(new CardStatusHandler(this.cards))
      .setNext(new TimeWindowHandler())
      .setNext(new MerchantCategoryHandler())
      .setNext(new MerchantLockHandler())
      .setNext(new TransactionLimitHandler())
      .setNext(new PeriodLimitHandler(this.cards))
      .setNext(new DepartmentFundsHandler());
    return head;
  }

  /**
   * Runs the whole decision inside ONE database transaction (ACID):
   * the card row and wallet row are locked, so two charges at the same moment are processed one after another
   * and can never overspend a limit or a wallet. A decline is saved too, but moves no money.
   */
  async charge(actor: AuthUser, dto: ChargeDto) {
    return this.dataSource.transaction(async (m) => {
      const [tenant] = await m.query('SELECT timezone FROM tenants WHERE id = $1', [actor.tenantId]);
      const ctx: AuthorizationContext = {
        m,
        tenantId: actor.tenantId,
        timezone: tenant.timezone,
        evaluatedAt: dto.simulatedAt ? new Date(dto.simulatedAt) : new Date(),
        request: { ...dto, merchantName: dto.merchantName.trim() },
      };
      const trace: CheckResult[] = [];
      const decision: Decision = await this.buildChain().handle(ctx, trace);
      const card = ctx.card;

      const tx = await m.save(
        m.create(CardTransaction, {
          tenantId: actor.tenantId,
          cardId: card?.id ?? null,
          departmentId: card?.departmentId ?? null,
          holderId: card?.holderId ?? null,
          cardLast4: dto.cardNumber.slice(-4),
          merchantName: ctx.request.merchantName,
          merchantCategory: dto.merchantCategory,
          amount: dto.amount,
          currency: 'BDT',
          status: decision.approved ? TransactionStatus.APPROVED : TransactionStatus.DECLINED,
          declineCode: decision.approved ? null : decision.code,
          declineMessage: decision.approved ? null : decision.message,
          checkTrace: trace,
          requestedById: actor.userId,
        }),
      );

      let walletBalanceAfter: number | null = null;
      if (decision.approved && card && ctx.wallet) {
        await this.wallets.debitForCardCharge(m, ctx.wallet, dto.amount, tx.id, `${ctx.request.merchantName} – card •••• ${card.last4}`, actor.userId);
        walletBalanceAfter = ctx.wallet.balance;
        if (card.type === CardType.SINGLE_USE) {
          await this.cards.applyTransition(m, card, 'burn', null, 'Single-use card was used');
        }
      }

      await this.audit.log(
        {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: decision.approved ? 'CHARGE_APPROVED' : 'CHARGE_DECLINED',
          entityType: 'CardTransaction',
          entityId: tx.id,
          details: { amount: dto.amount, merchant: ctx.request.merchantName, code: decision.approved ? null : decision.code },
        },
        m,
      );

      return {
        transactionId: tx.id,
        status: tx.status,
        declineCode: tx.declineCode,
        message: decision.approved ? 'Approved' : decision.message,
        amount: tx.amount,
        merchantName: tx.merchantName,
        cardStatusAfter: card?.status ?? null,
        walletBalanceAfter,
        checkTrace: trace,
        createdAt: tx.createdAt,
      };
    });
  }

  /** Recent attempts, scoped by role (the full search/filter screen is F9 in Sprint 3). */
  async recent(actor: AuthUser, limit = 25) {
    const params: unknown[] = [actor.tenantId];
    let scope = '';
    if (actor.role === Role.EMPLOYEE) { params.push(actor.userId); scope = `AND t.holder_id = $2`; }
    else if (actor.role === Role.DEPARTMENT_MANAGER) { params.push(actor.departmentId); scope = `AND t.department_id = $2`; }
    params.push(Math.min(limit, 200));
    return this.dataSource.query(
      `SELECT t.id, t.card_last4 AS "cardLast4", c.nickname AS "cardNickname", u.name AS "holderName", d.name AS "departmentName",
              t.merchant_name AS "merchantName", t.merchant_category AS "merchantCategory", t.amount::float AS amount, t.currency,
              t.status, t.decline_code AS "declineCode", t.decline_message AS "declineMessage", t.check_trace AS "checkTrace",
              t.created_at AS "createdAt"
         FROM card_transactions t
         LEFT JOIN virtual_cards c ON c.id = t.card_id
         LEFT JOIN users u ON u.id = t.holder_id
         LEFT JOIN departments d ON d.id = t.department_id
        WHERE t.tenant_id = $1 ${scope}
        ORDER BY t.created_at DESC
        LIMIT $${params.length}`,
      params,
    );
  }
}
