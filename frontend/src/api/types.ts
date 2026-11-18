// Types mirroring the backend Models (entities) and API responses.

export type Role = 'FINANCE_ADMIN' | 'FINANCE_MANAGER' | 'DEPARTMENT_MANAGER' | 'EMPLOYEE';
export type CardType = 'STANDARD' | 'SINGLE_USE' | 'SUBSCRIPTION';
export type CardStatus = 'ACTIVE' | 'FROZEN' | 'TERMINATED' | 'EXPIRED' | 'BURNED';
export type MerchantCategory = 'SAAS' | 'CLOUD' | 'ADVERTISING' | 'TRAVEL' | 'OFFICE_SUPPLIES' | 'FOOD' | 'ELECTRONICS' | 'OTHER';

export const ROLES: Role[] = ['FINANCE_ADMIN', 'FINANCE_MANAGER', 'DEPARTMENT_MANAGER', 'EMPLOYEE'];
export const ROLE_LABEL: Record<Role, string> = {
  FINANCE_ADMIN: 'Finance Admin',
  FINANCE_MANAGER: 'Finance Manager',
  DEPARTMENT_MANAGER: 'Department Manager',
  EMPLOYEE: 'Employee',
};
export const ROLE_RANK: Record<Role, number> = { FINANCE_ADMIN: 4, FINANCE_MANAGER: 3, DEPARTMENT_MANAGER: 2, EMPLOYEE: 1 };

export const CATEGORIES: MerchantCategory[] = ['SAAS', 'CLOUD', 'ADVERTISING', 'TRAVEL', 'OFFICE_SUPPLIES', 'FOOD', 'ELECTRONICS', 'OTHER'];
export const CATEGORY_LABEL: Record<MerchantCategory, string> = {
  SAAS: 'Software / SaaS', CLOUD: 'Cloud hosting', ADVERTISING: 'Advertising', TRAVEL: 'Travel & lodging',
  OFFICE_SUPPLIES: 'Office supplies', FOOD: 'Food & dining', ELECTRONICS: 'Electronics', OTHER: 'Other',
};
export const CARD_TYPE_LABEL: Record<CardType, string> = { STANDARD: 'Standard', SINGLE_USE: 'Single-use', SUBSCRIPTION: 'Subscription' };
export const WEEKDAYS = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 7, label: 'Sun' },
];

export interface Me {
  id: string; tenantId: string; name: string; email: string; role: Role;
  departmentId: string | null; departmentName: string | null; mustChangePassword: boolean;
}
export interface Company { id: string; name: string; baseCurrency: string; timezone: string; createdAt: string }

export interface DepartmentRow {
  id: string; name: string; code: string; status: 'ACTIVE' | 'ARCHIVED';
  managerId: string | null; managerName: string | null; walletId: string; walletBalance: number;
  memberCount: number; activeCardCount: number; createdAt: string;
}

export interface UserRow {
  id: string; name: string; email: string; role: Role; departmentId: string | null; departmentName: string | null;
  isActive: boolean; mustChangePassword: boolean; createdAt: string;
}

export interface WalletRow {
  id: string; type: 'TREASURY' | 'DEPARTMENT'; departmentId: string | null; departmentName: string | null;
  departmentCode: string | null; departmentStatus: string | null; balance: number; currency: string; updatedAt: string;
}
export interface LedgerRow {
  id: string; direction: 'CREDIT' | 'DEBIT'; kind: string; amount: number; balanceAfter: number; note: string | null;
  transactionId: string | null; createdAt: string; createdBy: string | null; counterparty: string | null;
}

export interface CardRules {
  perTransactionLimit?: number | null; dailyLimit?: number | null; monthlyLimit?: number | null; lifetimeLimit?: number | null;
  allowedCategories?: MerchantCategory[]; allowedMerchants?: string[]; allowedDays?: number[];
  allowedHours?: { start: number; end: number } | null;
}
export interface CardRow {
  id: string; nickname: string; type: CardType; last4: string; status: CardStatus; expiryMonth: number; expiryYear: number;
  expiresAt: string; rules: CardRules; createdAt: string; holderId: string; holderName: string;
  departmentId: string; departmentName: string; spentThisMonth: number;
}
export interface CardDetail extends Omit<CardRow, 'spentThisMonth'> {
  maskedNumber: string; issuedById: string; spend: { today: number; thisMonth: number; lifetime: number };
}
export interface CardSecrets { pan: string; cvv: string; expiryMonth: number; expiryYear: number }

export interface CheckResult { check: string; passed: boolean; detail: string }
export interface ChargeResult {
  transactionId: string; status: 'APPROVED' | 'DECLINED'; declineCode: string | null; message: string; amount: number;
  merchantName: string; cardStatusAfter: CardStatus | null; walletBalanceAfter: number | null; checkTrace: CheckResult[]; createdAt: string;
}
export interface TransactionRow {
  id: string; cardLast4: string; cardNickname: string | null; holderName: string | null; departmentName: string | null;
  merchantName: string; merchantCategory: MerchantCategory; amount: number; currency: string; status: 'APPROVED' | 'DECLINED';
  declineCode: string | null; declineMessage: string | null; checkTrace: CheckResult[]; createdAt: string;
}
