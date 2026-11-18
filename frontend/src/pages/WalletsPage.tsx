import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import type { WalletRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, dateTime, Empty, ErrorBox, Field, Modal, money, PageHeader, useLoad, useSubmit } from '../components/ui';

/** F4 – Treasury & Department Wallet Allocation. */
export default function WalletsPage() {
  const { isFinance } = useAuth();
  const { data, error, reload } = useLoad(() => api.wallets());
  const [selected, setSelected] = useState<WalletRow | null>(null);
  const [modal, setModal] = useState<null | 'deposit' | { kind: 'allocate' | 'reclaim'; wallet?: WalletRow }>(null);
  const treasury = data?.find((w) => w.type === 'TREASURY');
  const depts = data?.filter((w) => w.type === 'DEPARTMENT') ?? [];
  const current = selected ?? treasury ?? depts[0] ?? null;
  const done = () => { setModal(null); reload(); setSelected((s) => s); };

  return (
    <>
      <PageHeader
        feature="F4 · Treasury & department wallets"
        title="Wallets"
        subtitle="Money flows from the company treasury into department wallets; cards spend from their department's wallet."
        actions={isFinance && <>
          <button className="btn" onClick={() => setModal('deposit')}>Deposit to treasury</button>
          <button className="btn btn-primary" onClick={() => setModal({ kind: 'allocate' })}>Allocate to department</button>
        </>}
      />
      <ErrorBox errors={error} />

      <div className="wallet-grid">
        {treasury && (
          <button className={`wallet-tile treasury ${current?.id === treasury.id ? 'selected' : ''}`} onClick={() => setSelected(treasury)}>
            <div className="wallet-label">Company treasury</div>
            <div className="wallet-balance">{money(treasury.balance, treasury.currency)}</div>
            <div className="wallet-foot">Parent wallet</div>
          </button>
        )}
        {depts.map((w) => (
          <button key={w.id} className={`wallet-tile ${current?.id === w.id ? 'selected' : ''}`} onClick={() => setSelected(w)}>
            <div className="wallet-label">{w.departmentName} <span className="mono muted">{w.departmentCode}</span></div>
            <div className="wallet-balance">{money(w.balance, w.currency)}</div>
            <div className="wallet-foot">
              {w.departmentStatus === 'ARCHIVED' ? <Badge value="ARCHIVED" /> : isFinance && <>
                <span className="link-btn" role="button" onClick={(e) => { e.stopPropagation(); setModal({ kind: 'allocate', wallet: w }); }}>Allocate</span>
                <span className="link-btn" role="button" onClick={(e) => { e.stopPropagation(); setModal({ kind: 'reclaim', wallet: w }); }}>Reclaim</span>
              </>}
            </div>
          </button>
        ))}
      </div>
      {data && depts.length === 0 && <Empty>No department wallets yet. Create a department first.</Empty>}

      {current && <Ledger wallet={current} key={`${current.id}-${data?.find((w) => w.id === current.id)?.balance}`} />}

      {modal === 'deposit' && <DepositForm onClose={() => setModal(null)} onDone={done} />}
      {modal && modal !== 'deposit' && (
        <TransferForm kind={modal.kind} preset={modal.wallet} wallets={depts.filter((w) => w.departmentStatus === 'ACTIVE' || modal.kind === 'reclaim')}
          treasury={treasury} onClose={() => setModal(null)} onDone={done} />
      )}
    </>
  );
}

function Ledger({ wallet }: { wallet: WalletRow }) {
  const { data, error } = useLoad(() => api.ledger(wallet.id), [wallet.id]);
  return (
    <section className="panel flush">
      <div className="panel-head pad"><h2>Ledger · {wallet.type === 'TREASURY' ? 'Treasury' : wallet.departmentName}</h2><span className="muted small">Double-entry: every transfer writes a debit and a matching credit</span></div>
      <ErrorBox errors={error} />
      {data && data.entries.length === 0 && <Empty>No movements yet.</Empty>}
      {data && data.entries.length > 0 && (
        <table className="table">
          <thead><tr><th>When</th><th>Type</th><th>Description</th><th>Counterparty</th><th className="num">Amount</th><th className="num">Balance after</th></tr></thead>
          <tbody>
            {data.entries.map((l) => (
              <tr key={l.id}>
                <td className="nowrap small">{dateTime(l.createdAt)}</td>
                <td><Badge value={l.kind} tone={l.direction === 'CREDIT' ? 'green' : 'neutral'} /></td>
                <td>{l.note}<div className="muted small">{l.createdBy ? `by ${l.createdBy}` : ''}</div></td>
                <td>{l.counterparty ?? '—'}</td>
                <td className={`num ${l.direction === 'CREDIT' ? 'pos' : 'neg'}`}>{l.direction === 'CREDIT' ? '+' : '−'}{money(l.amount, '')}</td>
                <td className="num">{money(l.balanceAfter, '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DepositForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ amount: '', reference: '' });
  const { busy, errors, run } = useSubmit();
  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => { await api.deposit(Number(f.amount), f.reference); onDone(); }); };
  return (
    <Modal title="Deposit to treasury" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox errors={errors} />
        <p className="muted small">Simulates money arriving from the company's bank account.</p>
        <Field label="Amount (BDT)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required autoFocus /></Field>
        <Field label="Bank reference"><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} required minLength={2} placeholder="e.g. TT-2026-11-001" /></Field>
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>Deposit</button></div>
      </form>
    </Modal>
  );
}

function TransferForm({ kind, preset, wallets, treasury, onClose, onDone }: { kind: 'allocate' | 'reclaim'; preset?: WalletRow; wallets: WalletRow[]; treasury?: WalletRow; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ departmentId: preset?.departmentId ?? '', amount: '', note: '' });
  const { busy, errors, run } = useSubmit();
  const target = wallets.find((w) => w.departmentId === f.departmentId);
  const available = kind === 'allocate' ? treasury?.balance ?? 0 : target?.balance ?? 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (kind === 'allocate') await api.allocate(f.departmentId, Number(f.amount), f.note || undefined);
      else await api.reclaim(f.departmentId, Number(f.amount), f.note || undefined);
      onDone();
    });
  };
  return (
    <Modal title={kind === 'allocate' ? 'Allocate treasury money to a department' : 'Reclaim money to the treasury'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox errors={errors} />
        <Field label="Department">
          <select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} required>
            <option value="" disabled>Select…</option>
            {wallets.map((w) => <option key={w.id} value={w.departmentId!}>{w.departmentName} ({money(w.balance)})</option>)}
          </select>
        </Field>
        <Field label="Amount (BDT)" hint={`Available ${kind === 'allocate' ? 'in treasury' : 'in department'}: ${money(available)}`}>
          <input type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        </Field>
        <Field label="Note (optional)"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={200} /></Field>
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{kind === 'allocate' ? 'Allocate' : 'Reclaim'}</button></div>
      </form>
    </Modal>
  );
}
