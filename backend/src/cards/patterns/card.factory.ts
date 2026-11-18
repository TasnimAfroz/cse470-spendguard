import { BadRequestException, Injectable } from '@nestjs/common';
import { CardType } from '../../common/enums';
import { CardRules } from '../card-rules';

/**
 * DESIGN PATTERN: Factory (F5).
 * The service asks the factory for "a card of type X"; each concrete creator knows
 * the defaults and mandatory rules of its type. Adding a new card type = adding one creator class.
 */

export interface CardBlueprintInput {
  rules?: CardRules;
  /** SINGLE_USE: the maximum single payment. SUBSCRIPTION: the fixed monthly amount. */
  amount?: number;
  /** SUBSCRIPTION only: the one merchant the card may pay. */
  merchantName?: string;
}

export interface CardBlueprint {
  type: CardType;
  rules: CardRules;
  expiresAt: Date;
  expiryMonth: number;
  expiryYear: number;
}

interface CardCreator {
  readonly type: CardType;
  build(input: CardBlueprintInput, now: Date): CardBlueprint;
}

/** Card is valid until the last moment of the expiry month, like real cards. */
function endOfMonthYearsAhead(now: Date, years: number) {
  const year = now.getUTCFullYear() + years;
  const month = now.getUTCMonth() + 1;
  const expiresAt = new Date(Date.UTC(year, month, 1) - 1);
  return { expiresAt, expiryMonth: month, expiryYear: year };
}

class StandardCardCreator implements CardCreator {
  readonly type = CardType.STANDARD;
  build(input: CardBlueprintInput, now: Date): CardBlueprint {
    return { type: this.type, rules: { ...(input.rules ?? {}) }, ...endOfMonthYearsAhead(now, 3) };
  }
}

class SingleUseCardCreator implements CardCreator {
  readonly type = CardType.SINGLE_USE;
  build(input: CardBlueprintInput, now: Date): CardBlueprint {
    const max = input.amount ?? input.rules?.perTransactionLimit;
    if (!max || max <= 0) throw new BadRequestException('A single-use card needs the maximum payment amount');
    const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    return {
      type: this.type,
      // Lifetime = per-transaction = max: the card can only ever pay this once.
      rules: { ...(input.rules ?? {}), perTransactionLimit: max, lifetimeLimit: max, dailyLimit: null, monthlyLimit: null },
      expiresAt,
      expiryMonth: expiresAt.getUTCMonth() + 1,
      expiryYear: expiresAt.getUTCFullYear(),
    };
  }
}

class SubscriptionCardCreator implements CardCreator {
  readonly type = CardType.SUBSCRIPTION;
  build(input: CardBlueprintInput, now: Date): CardBlueprint {
    const merchant = input.merchantName?.trim();
    if (!merchant) throw new BadRequestException('A subscription card must be locked to a merchant name');
    if (!input.amount || input.amount <= 0) throw new BadRequestException('A subscription card needs the fixed monthly amount');
    return {
      type: this.type,
      rules: {
        ...(input.rules ?? {}),
        allowedMerchants: [merchant],
        perTransactionLimit: input.amount,
        monthlyLimit: input.amount,
        dailyLimit: null,
      },
      ...endOfMonthYearsAhead(now, 3),
    };
  }
}

@Injectable()
export class CardFactory {
  private readonly creators = new Map<CardType, CardCreator>(
    [new StandardCardCreator(), new SingleUseCardCreator(), new SubscriptionCardCreator()].map((c) => [c.type, c]),
  );

  create(type: CardType, input: CardBlueprintInput, now = new Date()): CardBlueprint {
    const creator = this.creators.get(type);
    if (!creator) throw new BadRequestException(`Unknown card type ${type}`);
    return creator.build(input, now);
  }
}
