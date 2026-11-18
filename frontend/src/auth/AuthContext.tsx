import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';
import type { Me, Role } from '../api/types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (token: string, me: Me) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
  /** UI convenience only – the backend RolesGuard is what actually enforces permissions. */
  hasRole: (...roles: Role[]) => boolean;
  isFinance: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => { tokenStore.clear(); setMe(null); }, []);
  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setMe(null); setLoading(false); return; }
    try { setMe(await api.me()); } catch { signOut(); } finally { setLoading(false); }
  }, [signOut]);

  useEffect(() => { setUnauthorizedHandler(signOut); refresh(); }, [refresh, signOut]);

  const value: AuthState = {
    me,
    loading,
    signIn: (token, user) => { tokenStore.set(token); setMe(user); },
    signOut,
    refresh,
    hasRole: (...roles) => !!me && roles.includes(me.role),
    isFinance: !!me && (me.role === 'FINANCE_ADMIN' || me.role === 'FINANCE_MANAGER'),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
