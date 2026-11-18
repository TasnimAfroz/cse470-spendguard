import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { CARD_TYPE_LABEL, type CardSecrets, type CardStatus, type CardType } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import CardVisual from '../components/CardVisual';
import RulesEditor, { describeRules, draftFromRules, rulesFromDraft } from '../components/RulesEditor';
import { Badge, CardStatusBadge, Empty, ErrorBox, Field, Modal, money, Notice, PageHeader, useLoad, useSubmit } from '../components/ui';

/** F5 – Virtual Card Issuance (list + issue). */
export default function CardsPage() {
  const { me, isFinance, hasRole } = useAuth();
  const canIssue = hasRole('FINANCE_ADMIN', 'FINANCE_MANAGER', 'DEPARTMENT_MANAGER');
  const [filter, setFilter] = useState<{ status: '' | CardStatus; departmentId: string }>({ status: '', departmentId: '' });
  const { data, error, reload } = useLoad(() => api.cards({ status: filter.status || undefined, departmentId: filter.departmentId || undefined }), [filter]);
  const depts = useLoad(() => (isFinance ? api.departments() : Promise.resolve([])));
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ id: string; nickname: string; holder: string; type: CardType; secrets: CardSecrets } | null>(null);

  return (
    <>
      <PageHeader
        feature="F5 · Virtual card issuance"
        title={me?.role === 'EMPLOYEE' ? 'My cards' : 'Cards'}
        subtitle="Each card is paid from its department's wallet and carries its own spending rules."
        actions={canIssue && <button className="btn btn-primary" onClick={() => setIssuing(true)}>Issue card</button>}
      />
      <ErrorBox errors={error} />
      <div className="filters">
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as CardStatus | '' })}>
          <option value="">All statuses</option>
          {['ACTIVE', 'FROZEN', 'TERMINATED', 'EXPIRED', 'BURNED'].map((s) => <option key={s}>{s}</option>)}
        </select>
        {isFinance && (
          <select value={filter.departmentId} onChange={(e) => setFilter({ ...filter, departmentId: e.target.value })}>
            <option value="">All departments</option>
            {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>
      <div className="panel flush">
        {data && data.length === 0 && <Empty>No cards{canIssue ? ' yet — issue the first one.' : ' assigned to you yet.'}</Empty>}
        {data && data.length > 0 && (
          <table className="table">
            <thead><tr><th>Card</th><th>Type</th><th>Holder</th><th>Rules</th><th className="num">Spent this month</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/cards/${c.id}`} className="strong">{c.nickname}</Link><div className="muted small mono">•••• {c.last4} · {String(c.expiryMonth).padStart(2, '0')}/{c.expiryYear}</div></td>
                  <td><Badge value={CARD_TYPE_LABEL[c.type]} tone="neutral" /></td>
                  <td>{c.holderName}<div className="muted small">{c.departmentName}</div></td>
                  <td className="small rules-cell">{describeRules(c.rules, (n) => money(n, '')).slice(0, 3).join(' · ')}</td>
                  <td className="num">{money(c.spentThisMonth)}</td>
                  <td><CardStatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {issuing && <IssueCard onClose={() => setIssuing(false)} onIssued={(r) => { setIssuing(false); setIssued(r); reload(); }} />}
      {issued && <IssuedSecrets issued={issued} onClose={() => setIssued(null)} />}
    </>
  );
}

function IssueCard({ onClose, onIssued }: { onClose: () => void; onIssued: (r: { id: string; nickname: string; holder: string; type: CardType; secrets: CardSecrets }) => void }) {
  const { me, isFinance } = useAuth();
  const people = useLoad(() => api.users());
  const [f, setF] = useState({ type: 'STANDARD' as CardType, holderId: '', nickname: '', amount: '', merchantName: '' });
  const [draft, setDraft] = useState(draftFromRules({ allowedCategories: [] }));
  const [showRules, setShowRules] = useState(true);
  const { busy, errors, run } = useSubmit();
  const holders = (people.data ?? []).filter((u) => u.isActive && u.departmentId && (isFinance || u.departmentId === me?.departmentId));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const rules = rulesFromDraft(draft);
      const r = await api.issueCard({
        type: f.type, holderId: f.holderId, nickname: f.nickname,
        amount: f.type === 'STANDARD' ? undefined : Number(f.amount),
        merchantName: f.type === 'SUBSCRIPTION' ? f.merchantName : undefined,
        rules: f.type === 'STANDARD' || showRules ? rules : undefined,
      });
      const holder = holders.find((h) => h.id === f.holderId)?.name ?? '';
      onIssued({ id: r.card.id, nickname: r.card.nickname, holder, type: r.card.type, secrets: r.secrets });
    });
  };

  const TYPES: { t: CardType; title: string; text: string }[] = [
    { t: 'STANDARD', title: 'Standard', text: 'Reusable card with your own limits' },
    { t: 'SINGLE_USE', title: 'Single-use', text: 'Burns after one payment; 30-day expiry' },
    { t: 'SUBSCRIPTION', title: 'Subscription', text: 'Locked to one vendor and a fixed monthly amount' },
  ];

  return (
    <Modal title="Issue a virtual card" onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorBox errors={errors} />
        <div className="type-picker">
          {TYPES.map((x) => (
            <button type="button" key={x.t} className={`type-option ${f.type === x.t ? 'on' : ''}`} onClick={() => { setF({ ...f, type: x.t }); setShowRules(x.t === 'STANDARD'); }}>
              <span className="strong">{x.title}</span><span className="muted small">{x.text}</span>
            </button>
          ))}
        </div>
        <div className="grid-2">
          <Field label="Card holder" hint="The card is paid from the holder's department wallet">
            <select value={f.holderId} onChange={(e) => setF({ ...f, holderId: e.target.value })} required>
              <option value="" disabled>Select…</option>
              {holders.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.departmentName}</option>)}
            </select>
          </Field>
          <Field label="Nickname"><input value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} required minLength={2} placeholder="e.g. AWS hosting" /></Field>
        </div>
        {f.type === 'SINGLE_USE' && (
          <Field label="Maximum payment (BDT)" hint="The card can pay once, up to this amount"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
        )}
        {f.type === 'SUBSCRIPTION' && (
          <div className="grid-2">
            <Field label="Vendor (merchant name)"><input value={f.merchantName} onChange={(e) => setF({ ...f, merchantName: e.target.value })} required placeholder="e.g. Figma" /></Field>
            <Field label="Fixed monthly amount (BDT)" hint="A price increase above this is declined"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
          </div>
        )}
        {f.type !== 'STANDARD' && (
          <label className="check-inline"><input type="checkbox" checked={showRules} onChange={(e) => setShowRules(e.target.checked)} /> Add extra rules (category, days, hours)</label>
        )}
        {showRules && <RulesEditor value={draft} onChange={setDraft} cardType={f.type} />}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Issuing…' : 'Issue card'}</button></div>
      </form>
    </Modal>
  );
}

function IssuedSecrets({ issued, onClose }: { issued: { id: string; nickname: string; holder: string; type: CardType; secrets: CardSecrets }; onClose: () => void }) {
  const nav = useNavigate();
  const s = issued.secrets;
  const expiry = `${String(s.expiryMonth).padStart(2, '0')}/${String(s.expiryYear).slice(-2)}`;
  return (
    <Modal title="Card issued" onClose={onClose}>
      <CardVisual nickname={issued.nickname} number={s.pan} expiry={expiry} holder={issued.holder} type={issued.type} status="ACTIVE" />
      <div className="secret-row"><span>CVV</span><span className="secret big">{s.cvv}</span></div>
      <Notice kind="warning">Copy the CVV now. It is stored only as a hash and <strong>cannot be shown again</strong>. The card number can be revealed later by the holder or a manager.</Notice>
      <div className="modal-actions">
        <button className="btn" onClick={() => navigator.clipboard?.writeText(`${s.pan} ${expiry} ${s.cvv}`)}>Copy details</button>
        <button className="btn btn-primary" onClick={() => { onClose(); nav(`/cards/${issued.id}`); }}>Open card</button>
      </div>
    </Modal>
  );
}
