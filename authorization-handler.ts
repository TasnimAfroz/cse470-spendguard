import { EntityManager } from 'typeorm';
import { DeclineCode } from '../../common/enums';
import { VirtualCard } from '../../cards/virtual-card.entity';
import { Wallet } from '../../wallets/wallet.entity';
import { CheckResult } from '../card-transaction.entity';
import { ChargeDto } from '../authorization.dto';

/** Everything the handlers share while one charge is being evaluated. Handlers fill it in as they go. */
export interface AuthorizationContext {
  m: EntityManager; // the open database transaction
  tenantId: string;
  timezone: string;
  /** Moment used for the time-window rule (the simulator may pass a test time). */
  evaluatedAt: Date;
  request: ChargeDto;
  card?: VirtualCard & { pan: string; cvvHash: string };
  wallet?: Wallet;
  spend?: { today: number; thisMonth: number; lifetime: number };
}

export type CheckOutcome = { passed: true; detail: string } | { passed: false; code: DeclineCode; detail: string };

export type Decision = { approved: true } | { approved: false; code: DeclineCode; message: string };

/**
 * DESIGN PATTERN: Chain of Responsibility (F8).
 * Each handler checks ONE rule. If it passes, the request goes to the next handler;
 * the first failure stops the chain and becomes the decline reason.
 * New rules (FX in F10, budget periods in F11, drift in F16) are added as new handlers
 * without touching the existing ones.
 */
export abstract class AuthorizationHandler {
  private next?: AuthorizationHandler;
  abstract readonly name: string;

  setNext(handler: AuthorizationHandler): AuthorizationHandler {
    this.next = handler;
    return handler; // allows a.setNext(b).setNext(c)
  }

  async handle(ctx: AuthorizationContext, trace: CheckResult[]): Promise<Decision> {
    const outcome = await this.check(ctx);
    trace.push({ check: this.name, passed: outcome.passed, detail: outcome.detail });
    if (!outcome.passed) return { approved: false, code: outcome.code, message: outcome.detail };
    return this.next ? this.next.handle(ctx, trace) : { approved: true };
  }

  protected abstract check(ctx: AuthorizationContext): Promise<CheckOutcome>;
}
