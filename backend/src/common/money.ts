import { ValueTransformer } from 'typeorm';

/**
 * Money is stored in PostgreSQL as NUMERIC(14,2) (exact decimal, never float).
 * The pg driver returns NUMERIC as a string, so this transformer converts it to a JS number,
 * and all arithmetic goes through whole paisa (cents) to avoid floating-point errors.
 */
export const moneyTransformer: ValueTransformer = {
  to: (value?: number | null) => (value === null || value === undefined ? value : value.toFixed(2)),
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};

export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;

export const addMoney = (a: number, b: number): number => fromCents(toCents(a) + toCents(b));
export const subMoney = (a: number, b: number): number => fromCents(toCents(a) - toCents(b));
