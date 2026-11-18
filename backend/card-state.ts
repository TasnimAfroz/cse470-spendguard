import { BadRequestException } from '@nestjs/common';
import { CardStatus } from '../../common/enums';

/**
 * DESIGN PATTERN: State (F7).
 * Each status is a class that decides which actions are legal from it.
 * The service never writes `if (status === 'X' && action === 'Y')` chains:
 * it asks the current state object, which either returns the next status or throws.
 */
export type CardAction = 'freeze' | 'unfreeze' | 'terminate' | 'burn' | 'expire';

abstract class CardState {
  abstract readonly status: CardStatus;

  freeze(): CardStatus { return this.illegal('freeze'); }
  unfreeze(): CardStatus { return this.illegal('unfreeze'); }
  terminate(): CardStatus { return this.illegal('terminate'); }
  burn(): CardStatus { return this.illegal('burn'); }
  expire(): CardStatus { return this.illegal('expire'); }

  protected illegal(action: CardAction): never {
    throw new BadRequestException(`Cannot ${action} a card that is ${this.status}`);
  }
}

class ActiveState extends CardState {
  readonly status = CardStatus.ACTIVE;
  freeze() { return CardStatus.FROZEN; }
  terminate() { return CardStatus.TERMINATED; }
  burn() { return CardStatus.BURNED; }
  expire() { return CardStatus.EXPIRED; }
}

class FrozenState extends CardState {
  readonly status = CardStatus.FROZEN;
  unfreeze() { return CardStatus.ACTIVE; }
  terminate() { return CardStatus.TERMINATED; }
  expire() { return CardStatus.EXPIRED; }
}

/** TERMINATED, BURNED and EXPIRED are final: every action is illegal. */
class FinalState extends CardState {
  constructor(readonly status: CardStatus) { super(); }
}

export function cardStateOf(status: CardStatus): CardState {
  switch (status) {
    case CardStatus.ACTIVE: return new ActiveState();
    case CardStatus.FROZEN: return new FrozenState();
    default: return new FinalState(status);
  }
}

/** Returns the next status for `action`, or throws 400 if the transition is not allowed. */
export function nextStatus(current: CardStatus, action: CardAction): CardStatus {
  const state = cardStateOf(current);
  return state[action]();
}
