import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Field, useSubmit } from '../components/ui';

export default function LoginPage() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, errors, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api.login(email, password);
      signIn(r.accessToken, r.user);
      nav('/', { replace: true });
    });
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">SpendGuard</div>
        <h1>Sign in</h1>
        <p className="muted">Corporate virtual cards with spending rules enforced before money moves.</p>
        <ErrorBox errors={errors} />
        <Field label="Work email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="auth-switch">New company? <Link to="/register">Register your company</Link></p>
        <p className="auth-hint">Demo after <code>npm run seed</code>: admin@acme.test / Password@123</p>
      </form>
    </div>
  );
}
