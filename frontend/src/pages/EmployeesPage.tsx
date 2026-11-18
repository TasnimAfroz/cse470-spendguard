import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { ROLE_LABEL, ROLE_RANK, ROLES, type Role, type UserRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Empty, ErrorBox, Field, Modal, Notice, PageHeader, useLoad, useSubmit } from '../components/ui';

/** F3 – Employee & Role Management. */
export default function EmployeesPage() {
  const { me, isFinance } = useAuth();
  const [filter, setFilter] = useState<{ departmentId: string; role: '' | Role; includeInactive: boolean }>({ departmentId: '', role: '', includeInactive: false });
  const { data, error, reload } = useLoad(() => api.users({ departmentId: filter.departmentId || undefined, role: filter.role || undefined, includeInactive: filter.includeInactive }), [filter]);
  const depts = useLoad(() => api.departments());
  const [modal, setModal] = useState<{ kind: 'add' } | { kind: 'edit' | 'deactivate'; user: UserRow } | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const close = () => setModal(null);

  const canManage = (u: UserRow) =>
    !!me && u.id !== me.id && ROLE_RANK[u.role] <= ROLE_RANK[me.role] &&
    (isFinance || (u.role === 'EMPLOYEE' && u.departmentId === me.departmentId));

  const reactivate = async (u: UserRow) => {
    try { await api.reactivateUser(u.id); setFlash(`${u.name} reactivated. Their cards stay frozen until a manager unfreezes them.`); reload(); }
    catch (e) { setFlash(String(e)); }
  };

  return (
    <>
      <PageHeader
        feature="F3 · Employee & role management"
        title="Employees"
        subtitle={isFinance ? 'Everyone in the company, their role and department.' : 'People in your department.'}
        actions={<button className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}>Add employee</button>}
      />
      <ErrorBox errors={error} />
      {flash && <Notice>{flash}</Notice>}
      {created && (
        <Notice kind="success">
          <strong>{created.name}</strong> can now sign in as <span className="mono">{created.email}</span> with the temporary password{' '}
          <span className="secret">{created.tempPassword}</span>. Hand it over securely; it is shown only once and must be changed at first login.
          <button className="link-btn" onClick={() => setCreated(null)}> Dismiss</button>
        </Notice>
      )}

      <div className="filters">
        {isFinance && (
          <select value={filter.departmentId} onChange={(e) => setFilter({ ...filter, departmentId: e.target.value })}>
            <option value="">All departments</option>
            {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <select value={filter.role} onChange={(e) => setFilter({ ...filter, role: e.target.value as Role | '' })}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <label className="check-inline"><input type="checkbox" checked={filter.includeInactive} onChange={(e) => setFilter({ ...filter, includeInactive: e.target.checked })} /> Include deactivated</label>
      </div>

      <div className="panel flush">
        {data && data.length === 0 && <Empty>No employees match.</Empty>}
        {data && data.length > 0 && (
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'row-dim'}>
                  <td><div className="strong">{u.name}{u.id === me?.id && <span className="muted"> (you)</span>}</div><div className="muted small">{u.email}</div></td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>{u.departmentName ?? <span className="muted">—</span>}</td>
                  <td>{u.isActive ? <Badge value="ACTIVE" /> : <Badge value="INACTIVE" />}{u.mustChangePassword && u.isActive && <div className="muted small">temporary password</div>}</td>
                  <td className="row-actions">
                    {canManage(u) && u.isActive && <>
                      {isFinance && <button className="btn btn-sm" onClick={() => setModal({ kind: 'edit', user: u })}>Edit</button>}
                      <button className="btn btn-sm btn-danger-ghost" onClick={() => setModal({ kind: 'deactivate', user: u })}>Deactivate</button>
                    </>}
                    {canManage(u) && !u.isActive && <button className="btn btn-sm" onClick={() => reactivate(u)}>Reactivate</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'add' && (
        <AddEmployee depts={depts.data ?? []} onClose={close}
          onDone={(r) => { close(); setCreated(r); reload(); }} />
      )}
      {modal?.kind === 'edit' && <EditEmployee user={modal.user} depts={depts.data ?? []} onClose={close} onDone={() => { close(); reload(); }} />}
      {modal?.kind === 'deactivate' && (
        <Deactivate user={modal.user} onClose={close} onDone={(n) => { close(); setFlash(`${modal.user.name} deactivated. ${n} card(s) frozen.`); reload(); }} />
      )}
    </>
  );
}

function AddEmployee({ depts, onClose, onDone }: { depts: { id: string; name: string }[]; onClose: () => void; onDone: (r: { name: string; email: string; tempPassword: string }) => void }) {
  const { me, isFinance } = useAuth();
  const grantable = ROLES.filter((r) => me && ROLE_RANK[r] <= ROLE_RANK[me.role] && (isFinance || r === 'EMPLOYEE'));
  const [f, setF] = useState({ name: '', email: '', role: 'EMPLOYEE' as Role, departmentId: isFinance ? '' : me?.departmentId ?? '' });
  const { busy, errors, run } = useSubmit();
  const needsDept = f.role === 'EMPLOYEE';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api.createUser({ name: f.name, email: f.email, role: f.role, departmentId: f.departmentId || undefined });
      onDone({ name: r.user.name, email: r.user.email, tempPassword: r.tempPassword });
    });
  };
  return (
    <Modal title="Add employee" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox errors={errors} />
        <Field label="Full name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} autoFocus /></Field>
        <Field label="Work email"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Role" hint="You can only grant roles up to your own">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{grantable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </Field>
        <Field label={needsDept ? 'Department' : 'Department (optional)'} hint={f.role === 'DEPARTMENT_MANAGER' ? 'Set automatically when you assign them as a department manager' : undefined}>
          <select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} required={needsDept} disabled={!isFinance}>
            <option value="">— none —</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <p className="muted small">A one-time temporary password is generated. The employee must change it after signing in.</p>
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>Add employee</button></div>
      </form>
    </Modal>
  );
}

function EditEmployee({ user, depts, onClose, onDone }: { user: UserRow; depts: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const { me } = useAuth();
  const [f, setF] = useState({ name: user.name, role: user.role, departmentId: user.departmentId ?? '' });
  const { busy, errors, run } = useSubmit();
  const grantable = ROLES.filter((r) => me && ROLE_RANK[r] <= ROLE_RANK[me.role]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: { name?: string; role?: Role; departmentId?: string } = {};
    if (f.name !== user.name) body.name = f.name;
    if (f.role !== user.role) body.role = f.role;
    if (f.departmentId && f.departmentId !== user.departmentId) body.departmentId = f.departmentId;
    run(async () => { await api.updateUser(user.id, body); onDone(); });
  };
  return (
    <Modal title={`Edit ${user.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox errors={errors} />
        <Field label="Full name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></Field>
        <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{grantable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        <Field label="Department" hint="Moving someone requires terminating cards they hold on the old department first">
          <select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">— none —</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  );
}

function Deactivate({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (frozen: number) => void }) {
  const { busy, errors, run } = useSubmit();
  return (
    <Modal title={`Deactivate ${user.name}?`} onClose={onClose}>
      <ErrorBox errors={errors} />
      <p>They lose access immediately, even if they are signed in, and <strong>every active card they hold is frozen</strong>. You can reactivate them later; cards stay frozen until a manager unfreezes them.</p>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={() => run(async () => { const r = await api.deactivateUser(user.id); onDone(r.frozenCards); })}>Deactivate</button></div>
    </Modal>
  );
}
