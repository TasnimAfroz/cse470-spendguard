import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Field, useSubmit } from '../components/ui';

/** F1 – Company Onboarding. */
export default function RegisterPage() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ companyName: '', baseCurrency: 'BDT', timezone: 'Asia/Dhaka', adminName: '', adminEmail: '', adminPassword: '', confirm: '' });
  const { busy, errors, setErrors, run } = useSubmit();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (f.adminPassword !== f.confirm) { setErrors(['Passwords do not match']); return; }
    run(async () => {
      const { confirm: _c, ...body } = f;
      const r = await api.registerCompany(body);
      signIn(r.accessToken, r.user);
      nav('/');
    });
  };

  return (
    <div className="auth-page">
      <form className="auth-card auth-card-wide" onSubmit={submit}>
        <div className="auth-brand">SpendGuard</div>
        <div className="feature-tag">F1 · Company onboarding</div>
        <h1>Register your company</h1>
        <p className="muted">Creates an isolated company workspace, your Finance Admin account and an empty treasury wallet.</p>
        <ErrorBox errors={errors} />
        <fieldset>
          <legend>Company</legend>
          <Field label="Company name"><input value={f.companyName} onChange={set('companyName')} required minLength={2} /></Field>
          <div className="grid-2">
            <Field label="Base currency">
              <select value={f.baseCurrency} onChange={set('baseCurrency')}><option>BDT</option><option>USD</option><option>EUR</option><option>GBP</option></select>
            </Field>
            <Field label="Timezone" hint="Used for card time-window rules and daily limits">
              <select value={f.timezone} onChange={set('timezone')}>
                {['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'].map((z) => <option key={z}>{z}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>
        <fieldset>
          <legend>Finance Admin (you)</legend>
          <Field label="Full name"><input value={f.adminName} onChange={set('adminName')} required minLength={2} /></Field>
          <Field label="Work email"><input type="email" value={f.adminEmail} onChange={set('adminEmail')} required /></Field>
          <div className="grid-2">
            <Field label="Password" hint="At least 8 characters"><input type="password" value={f.adminPassword} onChange={set('adminPassword')} required minLength={8} /></Field>
            <Field label="Confirm password"><input type="password" value={f.confirm} onChange={set('confirm')} required /></Field>
          </div>
        </fieldset>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating workspace…' : 'Create company workspace'}</button>
        <p className="auth-switch">Already registered? <Link to="/">Sign in</Link></p>
      </form>
    </div>
  );
}
