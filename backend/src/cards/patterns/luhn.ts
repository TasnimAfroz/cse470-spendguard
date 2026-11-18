import { randomInt } from 'crypto';

/** Luhn (mod 10) check digit – the same checksum real card numbers use. */
export function luhnCheckDigit(partial: string): number {
  let sum = 0;
  // Walk from the right; because the check digit will be appended, the rightmost partial digit is doubled.
  for (let i = 0; i < partial.length; i++) {
    let d = Number(partial[partial.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidLuhn(pan: string): boolean {
  if (!/^\d{12,19}$/.test(pan)) return false;
  return luhnCheckDigit(pan.slice(0, -1)) === Number(pan[pan.length - 1]);
}

/** Our simulated issuer BIN (Bank Identification Number). Starts with 4 like Visa test ranges. */
export const ISSUER_BIN = '453201';

export function generatePan(): string {
  let body = ISSUER_BIN;
  while (body.length < 15) body += randomInt(10).toString();
  return body + luhnCheckDigit(body);
}

export function generateCvv(): string {
  return randomInt(1000).toString().padStart(3, '0');
}

export const maskPan = (last4: string) => `4532 •••• •••• ${last4}`;
