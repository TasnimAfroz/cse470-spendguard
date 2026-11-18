import { BadRequestException, Injectable } from '@nestjs/common';
import { CardType } from '../common/enums';
import { CardRules } from './card-rules';

/** F6 – cross-field business rules that a DTO decorator cannot express. */
@Injectable()
export class CardRulesValidator {
  /** Cleans the rules (drops empty values, de-duplicates) and throws 400 with every problem found. */
  validate(type: CardType, input: CardRules): CardRules {
    const rules = this.normalise(input);
    const errors: string[] = [];

    const ordered: [string, number | null | undefined][] = [
      ['per-transaction', rules.perTransactionLimit],
      ['daily', rules.dailyLimit],
      ['monthly', rules.monthlyLimit],
      ['lifetime', rules.lifetimeLimit],
    ];
    const set = ordered.filter(([, v]) => v !== null && v !== undefined) as [string, number][];
    for (let i = 0; i < set.length - 1; i++) {
      for (let j = i + 1; j < set.length; j++) {
        if (set[i][1] > set[j][1]) errors.push(`The ${set[i][0]} limit (${set[i][1]}) cannot be larger than the ${set[j][0]} limit (${set[j][1]})`);
      }
    }

    if (rules.allowedDays && rules.allowedDays.length === 0) errors.push('Select at least one weekday');
    if (rules.allowedHours && rules.allowedHours.start >= rules.allowedHours.end) {
      errors.push('Allowed hours: the start hour must be before the end hour');
    }

    if (type === CardType.SUBSCRIPTION && rules.allowedMerchants?.length !== 1) {
      errors.push('A subscription card must stay locked to exactly one merchant');
    }
    if (type === CardType.SINGLE_USE && !rules.perTransactionLimit) {
      errors.push('A single-use card must keep its maximum payment amount');
    }

    if (errors.length) throw new BadRequestException(errors);
    return rules;
  }

  private normalise(r: CardRules): CardRules {
    const clean: CardRules = {
      perTransactionLimit: r.perTransactionLimit ?? null,
      dailyLimit: r.dailyLimit ?? null,
      monthlyLimit: r.monthlyLimit ?? null,
      lifetimeLimit: r.lifetimeLimit ?? null,
      allowedCategories: [...new Set(r.allowedCategories ?? [])],
      allowedMerchants: [...new Set((r.allowedMerchants ?? []).map((s) => s.trim()).filter(Boolean))],
      allowedHours: r.allowedHours ? { start: r.allowedHours.start, end: r.allowedHours.end } : null,
    };
    // undefined = every day; [] is kept so validate() can reject "no day selected".
    if (r.allowedDays !== undefined && r.allowedDays !== null) clean.allowedDays = [...new Set(r.allowedDays)].sort();
    return clean;
  }
}
