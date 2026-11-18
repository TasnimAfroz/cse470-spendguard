/**
 * Shared enumerations used by Models (entities), Controllers (DTO validation)
 * and the React View (copied into frontend/src/types.ts).
 */

/** Role hierarchy, highest first. The numeric rank is used to stop users granting roles above their own. */
export enum Role {
  FINANCE_ADMIN = 'FINANCE_ADMIN',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
  DEPARTMENT_MANAGER = 'DEPARTMENT_MANAGER',
  EMPLOYEE = 'EMPLOYEE',
}

export const ROLE_RANK: Record<Role, number> = {
  [Role.FINANCE_ADMIN]: 4,
  [Role.FINANCE_MANAGER]: 3,
  [Role.DEPARTMENT_MANAGER]: 2,
  [Role.EMPLOYEE]: 1,
};

/** Roles that can act across the whole company (not limited to one department). */
export const FINANCE_ROLES = [Role.FINANCE_ADMIN, Role.FINANCE_MANAGER];

export enum DepartmentStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum WalletType {
  TREASURY = 'TREASURY',
  DEPARTMENT = 'DEPARTMENT',
}

export enum LedgerDirection {
  CREDIT = 'CREDIT', // money in
  DEBIT = 'DEBIT', // money out
}

export enum LedgerKind {
  DEPOSIT = 'DEPOSIT',
  ALLOCATION = 'ALLOCATION',
  RECLAIM = 'RECLAIM',
  CARD_CHARGE = 'CARD_CHARGE',
}

export enum CardType {
  STANDARD = 'STANDARD',
  SINGLE_USE = 'SINGLE_USE',
  SUBSCRIPTION = 'SUBSCRIPTION',
}

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  TERMINATED = 'TERMINATED',
  EXPIRED = 'EXPIRED',
  BURNED = 'BURNED',
}

export enum MerchantCategory {
  SAAS = 'SAAS',
  CLOUD = 'CLOUD',
  ADVERTISING = 'ADVERTISING',
  TRAVEL = 'TRAVEL',
  OFFICE_SUPPLIES = 'OFFICE_SUPPLIES',
  FOOD = 'FOOD',
  ELECTRONICS = 'ELECTRONICS',
  OTHER = 'OTHER',
}

export enum TransactionStatus {
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
}

export enum DeclineCode {
  CARD_NOT_FOUND = 'CARD_NOT_FOUND',
  INVALID_CARD_DETAILS = 'INVALID_CARD_DETAILS',
  CARD_NOT_ACTIVE = 'CARD_NOT_ACTIVE',
  CARD_EXPIRED = 'CARD_EXPIRED',
  OUTSIDE_TIME_WINDOW = 'OUTSIDE_TIME_WINDOW',
  CATEGORY_NOT_ALLOWED = 'CATEGORY_NOT_ALLOWED',
  MERCHANT_NOT_ALLOWED = 'MERCHANT_NOT_ALLOWED',
  EXCEEDS_TRANSACTION_LIMIT = 'EXCEEDS_TRANSACTION_LIMIT',
  EXCEEDS_DAILY_LIMIT = 'EXCEEDS_DAILY_LIMIT',
  EXCEEDS_MONTHLY_LIMIT = 'EXCEEDS_MONTHLY_LIMIT',
  EXCEEDS_LIFETIME_LIMIT = 'EXCEEDS_LIFETIME_LIMIT',
  INSUFFICIENT_DEPARTMENT_FUNDS = 'INSUFFICIENT_DEPARTMENT_FUNDS',
}
