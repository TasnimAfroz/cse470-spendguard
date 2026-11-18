import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Field, Notice, PageHeader, useSubmit } from '../components/ui';

/** Supporting page (not a counted feature): change own password. */
export default function AccountPage() {
  const { refresh } = useAuth();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [done, setDone] = useState(false);
  const { busy, errors, setErrors, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (f.next !== f.confirm) { setErrors(['New passwords do not match']); return; }
    run(async () => {
      await api.changePassword(f.current, f.next);
      setDone(true); setF({ current: '', next: '', confirm: '' });
      await refresh();
    });
  };

  return (
    <>
      <PageHeader title="Change password" />
      <form className="panel narrow" onSubmit={submit}>
        {done && <Notice kind="success">Password changed.</Notice>}
        <ErrorBox errors={errors} />
        <Field label="Current password"><input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></Field>
        <Field label="New password" hint="At least 8 characters"><input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required minLength={8} /></Field>
        <Field label="Confirm new password"><input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
        <button className="btn btn-primary" disabled={busy}>Save password</button>
      </form>
    </>
  );
}
