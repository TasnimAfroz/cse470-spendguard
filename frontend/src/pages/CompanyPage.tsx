import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { dateTime, ErrorBox, Field, Notice, PageHeader, useLoad, useSubmit } from '../components/ui';

/** F1 – company profile (tenant). */
export default function CompanyPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('FINANCE_ADMIN');
  const { data, error, reload } = useLoad(() => api.company());
  const [f, setF] = useState({ name: '', timezone: '' });
  const [saved, setSaved] = useState(false);
  const { busy, errors, run } = useSubmit();

  useEffect(() => { if (data) setF({ name: data.name, timezone: data.timezone }); }, [data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    run(async () => { await api.updateCompany(f); await reload(); setSaved(true); });
  };

  return (
    <>
      <PageHeader feature="F1 · Company onboarding & tenant isolation" title="Company" subtitle="Your isolated company workspace. Nothing here is visible to other companies." />
      <ErrorBox errors={error} />
      {data && (
        <div className="grid-2 gap-lg">
          <form className="panel" onSubmit={submit}>
            <h2>Profile</h2>
            {saved && <Notice kind="success">Saved.</Notice>}
            <ErrorBox errors={errors} />
            <Field label="Company name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!isAdmin} required minLength={2} /></Field>
            <Field label="Timezone" hint="Card day/time rules and daily/monthly limits use this timezone">
              <select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} disabled={!isAdmin}>
                {['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'].map((z) => <option key={z}>{z}</option>)}
              </select>
            </Field>
            {isAdmin ? <button className="btn btn-primary" disabled={busy}>Save changes</button> : <p className="muted small">Only the Finance Admin can edit the company profile.</p>}
          </form>
          <section className="panel">
            <h2>Workspace</h2>
            <dl className="dl">
              <dt>Tenant ID</dt><dd className="mono small">{data.id}</dd>
              <dt>Base currency</dt><dd>{data.baseCurrency}</dd>
              <dt>Registered</dt><dd>{dateTime(data.createdAt)}</dd>
            </dl>
            <p className="muted small">Every record in the database carries this tenant ID. The API always takes the tenant from your login token, never from the request, so one company cannot read another company's data.</p>
          </section>
        </div>
      )}
    </>
  );
}
