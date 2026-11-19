import * as bcrypt from 'bcryptjs';
import { CardStatus, DeclineCode } from '../../common/enums';
import { CardsService } from '../../cards/cards.service';
import { VirtualCard } from '../../cards/virtual-card.entity';
import { Wallet } from '../../wallets/wallet.entity';
import { AuthorizationContext, AuthorizationHandler, CheckOutcome } from './authorization-handler';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** 1. The card number must belong to a card of THIS company. Locks the card row for the rest of the transaction. */
export class CardExistsHandler extends AuthorizationHandler {
  readonly name = 'Card exists';
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const card = await ctx.m
      .createQueryBuilder(VirtualCard, 'c')
      .addSelect(['c.pan', 'c.cvvHash'])
      .where('c.pan = :pan AND c.tenantId = :t', { pan: ctx.request.cardNumber, t: ctx.tenantId })
      .setLock('pessimistic_write')
      .getOne();
    if (!card) return { passed: false, code: DeclineCode.CARD_NOT_FOUND, detail: 'No card with this number in this company' };
    ctx.card = card as AuthorizationContext['card'];
    return { passed: true, detail: `${card.nickname} (•••• ${card.last4})` };
  }
}

/** 2. Expiry date and CVV must match what was printed on the card. */
export class CardDetailsHandler extends AuthorizationHandler {
  readonly name = 'Expiry date and CVV match';
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const c = ctx.card!;
    const r = ctx.request;
    const expiryOk = c.expiryMonth === r.expiryMonth && c.expiryYear === r.expiryYear;
    const cvvOk = await bcrypt.compare(r.cvv, c.cvvHash);
    if (!expiryOk || !cvvOk) return { passed: false, code: DeclineCode.INVALID_CARD_DETAILS, detail: 'Expiry date or CVV is wrong' };
    return { passed: true, detail: 'Details match' };
  }
}

/** 3. Card must be ACTIVE and not past its expiry moment (expires it on the spot if needed). */
export class CardStatusHandler extends AuthorizationHandler {
  readonly name = 'Card is active';
  constructor(private readonly cards: CardsService) { super(); }
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const c = ctx.card!;
    if ((c.status === CardStatus.ACTIVE || c.status === CardStatus.FROZEN) && c.expiresAt.getTime() < Date.now()) {
      await this.cards.applyTransition(ctx.m, c, 'expire', null, 'Expiry date passed (detected at authorization)');
    }
    if (c.status === CardStatus.EXPIRED) return { passed: false, code: DeclineCode.CARD_EXPIRED, detail: 'Card has expired' };
    if (c.status !== CardStatus.ACTIVE) return { passed: false, code: DeclineCode.CARD_NOT_ACTIVE, detail: `Card is ${c.status}` };
    return { passed: true, detail: 'ACTIVE' };
  }
}

/** 4. Weekday and hour, evaluated in the company's timezone. */
export class TimeWindowHandler extends AuthorizationHandler {
  readonly name = 'Allowed day and time';
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const { allowedDays, allowedHours } = ctx.card!.rules;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: ctx.timezone, weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(ctx.evaluatedAt);
    const weekdayShort = parts.find((p) => p.type === 'weekday')!.value;
    const hour = Number(parts.find((p) => p.type === 'hour')!.value);
    const minute = parts.find((p) => p.type === 'minute')!.value;
    const isoDay = DAY_NAMES.indexOf(weekdayShort);
    const when = `${weekdayShort} ${String(hour).padStart(2, '0')}:${minute} (${ctx.timezone})`;

    if (allowedDays && allowedDays.length && !allowedDays.includes(isoDay)) {
      return { passed: false, code: DeclineCode.OUTSIDE_TIME_WINDOW, detail: `${when}: card works only on ${allowedDays.map((d) => DAY_NAMES[d]).join(', ')}` };
    }
    if (allowedHours && (hour < allowedHours.start || hour >= allowedHours.end)) {
      return { passed: false, code: DeclineCode.OUTSIDE_TIME_WINDOW, detail: `${when}: card works only ${allowedHours.start}:00–${allowedHours.end}:00` };
    }
    return { passed: true, detail: when };
  }
}

/** 5. Merchant category (MCC lock). */
export class MerchantCategoryHandler extends AuthorizationHandler {
  readonly name = 'Merchant category allowed';
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const allowed = ctx.card!.rules.allowedCategories ?? [];
    const cat = ctx.request.merchantCategory;
    if (allowed.length && !allowed.includes(cat)) {
      return { passed: false, code: DeclineCode.CATEGORY_NOT_ALLOWED, detail: `${cat} is not allowed (card allows ${allowed.join(', ')})` };
    }
    return { passed: true, detail: allowed.length ? `${cat} is allowed` : 'All categories allowed' };
  }
}

/** 6. Merchant name lock (vendor-locked / subscription cards). */
export class MerchantLockHandler extends AuthorizationHandler {
  readonly name = 'Merchant allowed';
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const allowed = ctx.card!.rules.allowedMerchants ?? [];
    const name = ctx.request.merchantName.trim().toLowerCase();
    if (allowed.length && !allowed.some((a) => a.toLowerCase() === name)) {
      return { passed: false, code: DeclineCode.MERCHANT_NOT_ALLOWED, detail: `"${ctx.request.merchantName}" is not allowed (card locked to ${allowed.join(', ')})` };
    }
    return { passed: true, detail: allowed.length ? `Locked merchant matches` : 'Any merchant allowed' };
  }
}

/** 7. Single payment size. */
export class TransactionLimitHandler extends AuthorizationHandler {
  readonly name = 'Per-transaction limit';
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const limit = ctx.card!.rules.perTransactionLimit;
    const amount = ctx.request.amount;
    if (limit && amount > limit) {
      return { passed: false, code: DeclineCode.EXCEEDS_TRANSACTION_LIMIT, detail: `${fmt(amount)} is above the per-transaction limit of ${fmt(limit)}` };
    }
    return { passed: true, detail: limit ? `${fmt(amount)} ≤ ${fmt(limit)}` : 'No per-transaction limit' };
  }
}

/** 8. Daily / monthly / lifetime totals of APPROVED charges + this amount. */
export class PeriodLimitHandler extends AuthorizationHandler {
  readonly name = 'Daily, monthly and lifetime limits';
  constructor(private readonly cards: CardsService) { super(); }
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const c = ctx.card!;
    const spend = await this.cards.spendSummary(ctx.m, c.id, ctx.tenantId);
    ctx.spend = spend;
    const amount = ctx.request.amount;
    const checks: [number | null | undefined, number, DeclineCode, string][] = [
      [c.rules.dailyLimit, spend.today, DeclineCode.EXCEEDS_DAILY_LIMIT, 'daily'],
      [c.rules.monthlyLimit, spend.thisMonth, DeclineCode.EXCEEDS_MONTHLY_LIMIT, 'monthly'],
      [c.rules.lifetimeLimit, spend.lifetime, DeclineCode.EXCEEDS_LIFETIME_LIMIT, 'lifetime'],
    ];
    for (const [limit, spent, code, label] of checks) {
      if (limit && spent + amount > limit) {
        return { passed: false, code, detail: `Already spent ${fmt(spent)} of the ${label} limit ${fmt(limit)}; ${fmt(amount)} more would exceed it` };
      }
    }
    return { passed: true, detail: `Spent today ${fmt(spend.today)}, this month ${fmt(spend.thisMonth)}, lifetime ${fmt(spend.lifetime)}` };
  }
}

/** 9. The department wallet must hold enough money. Locks the wallet row so concurrent charges cannot overdraw it. */
export class DepartmentFundsHandler extends AuthorizationHandler {
  readonly name = 'Department wallet balance';
  protected async check(ctx: AuthorizationContext): Promise<CheckOutcome> {
    const wallet = await ctx.m.findOne(Wallet, { where: { departmentId: ctx.card!.departmentId }, lock: { mode: 'pessimistic_write' } });
    if (!wallet || wallet.balance < ctx.request.amount) {
      return { passed: false, code: DeclineCode.INSUFFICIENT_DEPARTMENT_FUNDS, detail: `Department wallet has ${fmt(wallet?.balance ?? 0)}, needs ${fmt(ctx.request.amount)}` };
    }
    ctx.wallet = wallet;
    return { passed: true, detail: `Balance ${fmt(wallet.balance)} covers ${fmt(ctx.request.amount)}` };
  }
}
