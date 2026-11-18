import { MerchantCategory } from '../common/enums';

/**
 * The spending rules attached to every card (F6). Stored as one PostgreSQL JSONB column
 * so new rule types can be added later without changing the table.
 * A missing / null / empty value means "no restriction" for that rule.
 */
export interface CardRules {
  perTransactionLimit?: number | null;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  lifetimeLimit?: number | null;
  /** Empty = all categories allowed. */
  allowedCategories?: MerchantCategory[];
  /** Empty = any merchant. Matched case-insensitively. SUBSCRIPTION cards always have exactly one. */
  allowedMerchants?: string[];
  /** ISO weekdays 1 = Monday … 7 = Sunday. Empty = every day. */
  allowedDays?: number[];
  /** Hour window in the company timezone; start inclusive, end exclusive (8–19 = 08:00 to 18:59). */
  allowedHours?: { start: number; end: number } | null;
}
