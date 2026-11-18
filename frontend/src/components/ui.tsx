import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import type { CardStatus } from '../api/types';

/** Small presentational building blocks shared by all pages (View layer only – no business rules). */

export const money = (n: number | null | undefined, currency = 'BDT') =>
  n === null || n === undefined ? '—' : `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const errorText = (e: unknown) => (e instanceof ApiError ? e.messages : [e instanceof Error ? e.message : String(e)]);

/** Loads data on mount and whenever `deps` change; returns a `reload` for after mutations. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    setLoading(true);
    return loader().then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e))).finally(() => setLoading(false));
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}

export function ErrorBox({ errors }: { errors: string[] | null }) {
  if (!errors || !errors.length) return null;
  return (
    <div className="alert alert-error" role="alert">
      {errors.length === 1 ? errors[0] : <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'success' | 'warning' }) {
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'green', APPROVED: 'green', FROZEN: 'blue', TERMINATED: 'gray', EXPIRED: 'gray', BURNED: 'amber',
  DECLINED: 'red', ARCHIVED: 'gray', INACTIVE: 'gray',
};
export function Badge({ value, tone }: { value: string; tone?: string }) {
  return <span className={`badge badge-${tone ?? STATUS_TONE[value] ?? 'neutral'}`}>{value.replace(/_/g, ' ')}</span>;
}
export const CardStatusBadge = ({ status }: { status: CardStatus }) => <Badge value={status} />;

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, feature }: { title: string; subtitle?: string; actions?: ReactNode; feature?: string }) {
  return (
    <div className="page-head">
      <div>
        {feature && <div className="feature-tag">{feature}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Wraps a submit handler with busy state + error capture. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErrors(null);
    try { await fn(); return true; } catch (e) { setErrors(errorText(e)); return false; } finally { setBusy(false); }
  };
  return { busy, errors, setErrors, run };
}
