import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import type { DepartmentRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Empty, ErrorBox, Field, Modal, money, PageHeader, useLoad, useSubmit } from '../components/ui';

/** F2 – Department Management. */
export default function DepartmentsPage() {
  const { isFinance } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, reload } = useLoad(() => api.departments(showArchived), [showArchived]);
  const managers = useLoad(() => (isFinance ? api.users({ role: 'DEPARTMENT_MANAGER' }) : Promise.resolve([])));
  const [modal, setModal] = useState<{ kind: 'create' } | { kind: 'edit' | 'manager' | 'archive'; dept: DepartmentRow } | null>(null);
  const close = () => setModal(null);
  const done = () => { close(); reload(); managers.reload(); };

  return (
    <>
      <PageHeader
        feature="F2 · Department management"
        title="Departments"
        subtitle="Each department has a manager and its own wallet that pays for its cards."
        actions={isFinance && <button className="btn btn-primary" onClick={() => setModal({ kind: 'create' })}>New department</button>}
      />
      <ErrorBox errors={error} />
      {isFinance && (
        <label className="check-inline"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      )}
      <div className="panel flush">
        {data && data.length === 0 && <Empty>No departments yet{isFinance ? ' — create the first one.' : '.'}</Empty>}
        {data && data.length > 0 && (
          <table className="table">
            <thead><tr><th>Department</th><th>Manager</th><th className="num">Members</th><th className="num">Live cards</th><th className="num">Wallet balance</th><th>Status</th>{isFinance && <th />}</tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <td><div className="strong">{d.name}</div><div className="muted small mono">{d.code}</div></td>
                  <td>{d.managerName ?? <span className="muted">Not assigned</span>}</td>
                  <td className="num">{d.memberCount}</td>
                  <td className="num">{d.activeCardCount}</td>
                  <td className="num">{money(d.walletBalance)}</td>
                  <td><Badge value={d.status} /></td>
                  {isFinance && (
                    <td className="row-actions">
                      {d.status === 'ACTIVE' && <>
                        <button className="btn btn-sm" onClick={() => setModal({ kind: 'edit', dept: d })}>Edit</button>
                        <button className="btn btn-sm" onClick={() => setModal({ kind: 'manager', dept: d })}>Manager</button>
                        <button className="btn btn-sm btn-danger-ghost" onClick={() => setModal({ kind: 'archive', dept: d })}>Archive</button>
                      </>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'create' && <DeptForm onClose={close} onDone={done} managers={managers.data ?? []} />}
      {modal?.kind === 'edit' && <DeptForm onClose={close} onDone={done} managers={[]} dept={modal.dept} />}
      {modal?.kind === 'manager' && <ManagerForm dept={modal.dept} managers={managers.data ?? []} onClose={close} onDone={done} />}
      {modal?.kind === 'archive' && <ArchiveConfirm dept={modal.dept} onClose={close} onDone={done} />}
    </>
  );
}

function DeptForm({ dept, managers, onClose, onDone }: { dept?: DepartmentRow; managers: { id: string; name: string; departmentId: string | null }[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: dept?.name ?? '', code: dept?.code ?? '', managerId: '' });
  const { busy, errors, run } = useSubmit();
  const free = managers.filter((m) => !m.departmentId);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (dept) await api.updateDepartment(dept.id, { name: f.name, code: f.code });
      else await api.createDepartment({ name: f.name, code: f.code, managerId: f.managerId || undefined });
      onDone();
    });
  };
  return (
    <Modal title={dept ? `Edit ${dept.name}` : 'New department'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox errors={errors} />
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} autoFocus /></Field>
        <Field label="Code" hint="2–10 letters or digits, unique in your company (e.g. ENG)">
          <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required pattern="[A-Za-z0-9]{2,10}" className="mono" />
        </Field>
        {!dept && (
          <Field label="Manager (optional)" hint="Only users with the Department Manager role who don't manage another department">
            <select value={f.managerId} onChange={(e) => setF({ ...f, managerId: e.target.value })}>
              <option value="">— assign later —</option>
              {free.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        )}
        {!dept && <p className="muted small">A wallet with balance 0 is created together with the department.</p>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{dept ? 'Save' : 'Create department'}</button></div>
      </form>
    </Modal>
  );
}

function ManagerForm({ dept, managers, onClose, onDone }: { dept: DepartmentRow; managers: { id: string; name: string; departmentId: string | null }[]; onClose: () => void; onDone: () => void }) {
  const [managerId, setManagerId] = useState(dept.managerId ?? '');
  const { busy, errors, run } = useSubmit();
  const options = managers.filter((m) => !m.departmentId || m.departmentId === dept.id || m.id === dept.managerId);
  return (
    <Modal title={`Manager of ${dept.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api.assignManager(dept.id, managerId); onDone(); }); }}>
        <ErrorBox errors={errors} />
        <Field label="Department manager" hint="Need someone new? Add them on the Employees page with the Department Manager role.">
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} required>
            <option value="" disabled>Select…</option>
            {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !managerId}>Assign</button></div>
      </form>
    </Modal>
  );
}

function ArchiveConfirm({ dept, onClose, onDone }: { dept: DepartmentRow; onClose: () => void; onDone: () => void }) {
  const { busy, errors, run } = useSubmit();
  return (
    <Modal title={`Archive ${dept.name}?`} onClose={onClose}>
      <ErrorBox errors={errors} />
      <p>An archived department cannot receive money or new cards. Archiving is only allowed when its wallet is empty and it has no active or frozen cards.</p>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={() => run(async () => { await api.archiveDepartment(dept.id); onDone(); })}>Archive</button></div>
    </Modal>
  );
}
