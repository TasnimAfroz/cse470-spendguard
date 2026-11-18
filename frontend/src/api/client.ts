import type {
  CardDetail, CardRow, CardRules, CardSecrets, CardStatus, CardType, ChargeResult, Company, DepartmentRow, LedgerRow, Me,
  MerchantCategory, Role, TransactionRow, UserRow, WalletRow,
} from './types';

/**
 * The only place the View talks to the backend Controllers.
 * Pages call these typed functions; they never build URLs or headers themselves.
 */

const TOKEN_KEY = 'vc_token';
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

export class ApiError extends Error {
  constructor(public status: number, public messages: string[]) {
    super(messages.join(' · '));
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const msg = data?.message ?? res.statusText;
    throw new ApiError(res.status, Array.isArray(msg) ? msg : [String(msg)]);
  }
  return data as T;
}

const qs = (params: Record<string, string | undefined | boolean>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false);
  return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : '';
};

export const api = {
  // auth (supporting)
  login: (email: string, password: string) => request<{ accessToken: string; user: Me }>('POST', '/auth/login', { email, password }),
  me: () => request<Me>('GET', '/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) => request('POST', '/users/me/password', { currentPassword, newPassword }),

  // F1
  registerCompany: (body: { companyName: string; baseCurrency: string; timezone: string; adminName: string; adminEmail: string; adminPassword: string }) =>
    request<{ accessToken: string; company: Company; user: Me }>('POST', '/companies/register', body),
  company: () => request<Company>('GET', '/companies/me'),
  updateCompany: (body: { name?: string; timezone?: string }) => request<Company>('PATCH', '/companies/me', body),

  // F2
  departments: (includeArchived = false) => request<DepartmentRow[]>('GET', '/departments' + qs({ includeArchived })),
  createDepartment: (body: { name: string; code: string; managerId?: string }) => request('POST', '/departments', body),
  updateDepartment: (id: string, body: { name?: string; code?: string }) => request('PATCH', `/departments/${id}`, body),
  assignManager: (id: string, managerId: string) => request('POST', `/departments/${id}/manager`, { managerId }),
  archiveDepartment: (id: string) => request('POST', `/departments/${id}/archive`),

  // F3
  users: (f: { departmentId?: string; role?: Role; includeInactive?: boolean } = {}) => request<UserRow[]>('GET', '/users' + qs(f)),
  createUser: (body: { name: string; email: string; role: Role; departmentId?: string }) =>
    request<{ user: UserRow; tempPassword: string }>('POST', '/users', body),
  updateUser: (id: string, body: { name?: string; role?: Role; departmentId?: string }) => request('PATCH', `/users/${id}`, body),
  deactivateUser: (id: string) => request<{ frozenCards: number }>('POST', `/users/${id}/deactivate`),
  reactivateUser: (id: string) => request('POST', `/users/${id}/reactivate`),

  // F4
  wallets: () => request<WalletRow[]>('GET', '/wallets'),
  ledger: (walletId: string) => request<{ entries: LedgerRow[] }>('GET', `/wallets/${walletId}/ledger`),
  deposit: (amount: number, reference: string) => request('POST', '/wallets/treasury/deposit', { amount, reference }),
  allocate: (departmentId: string, amount: number, note?: string) => request('POST', '/wallets/allocate', { departmentId, amount, note }),
  reclaim: (departmentId: string, amount: number, note?: string) => request('POST', '/wallets/reclaim', { departmentId, amount, note }),

  // F5 / F6 / F7
  cards: (f: { status?: CardStatus; departmentId?: string; holderId?: string } = {}) => request<CardRow[]>('GET', '/cards' + qs(f)),
  card: (id: string) => request<CardDetail>('GET', `/cards/${id}`),
  issueCard: (body: { type: CardType; holderId: string; nickname: string; amount?: number; merchantName?: string; rules?: CardRules }) =>
    request<{ card: CardDetail; secrets: CardSecrets }>('POST', '/cards', body),
  revealCard: (id: string) => request<{ pan: string; expiryMonth: number; expiryYear: number }>('POST', `/cards/${id}/reveal`),
  updateRules: (id: string, rules: CardRules) => request('PATCH', `/cards/${id}/rules`, rules),
  ruleHistory: (id: string) => request<{ id: string; oldRules: CardRules | null; newRules: CardRules; createdAt: string; changedBy: string }[]>('GET', `/cards/${id}/rule-history`),
  freezeCard: (id: string, reason?: string) => request('POST', `/cards/${id}/freeze`, { reason }),
  unfreezeCard: (id: string, reason?: string) => request('POST', `/cards/${id}/unfreeze`, { reason }),
  terminateCard: (id: string, reason: string) => request('POST', `/cards/${id}/terminate`, { reason }),
  statusHistory: (id: string) => request<{ id: string; fromStatus: CardStatus | null; toStatus: CardStatus; reason: string | null; createdAt: string; actor: string }[]>('GET', `/cards/${id}/status-history`),

  // F8
  charge: (body: { cardNumber: string; expiryMonth: number; expiryYear: number; cvv: string; merchantName: string; merchantCategory: MerchantCategory; amount: number; simulatedAt?: string }) =>
    request<ChargeResult>('POST', '/simulator/charge', body),
  transactions: (limit = 25) => request<TransactionRow[]>('GET', `/simulator/transactions?limit=${limit}`),
};
