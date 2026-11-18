import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { CardDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import CardVisual from '../components/CardVisual';
import RulesEditor, { describeRules, draftFromRules, rulesFromDraft } from '../components/RulesEditor';
import { Badge, CardStatusBadge, dateTime, ErrorBox, errorText, Field, Modal, money, PageHeader, useLoad, useSubmit } from '../components/ui';

/** F6 – Spending rules  +  F7 – Lifecycle (freeze / unfreeze / terminate, history). */
export default function CardDetailPage() {
  const { id = '' } = useParams();
  const { me, hasRole, isFinance } = useAuth();
  const card = useLoad(() => api.card(id), [id]);
  const statusHist = useLoad(() => api.statusHistory(id), [id]);
  const ruleHist = useLoad(() => api.ruleHistory(id), [id]);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<null | 'freeze' | 'unfreeze' | 'terminate'>(null);
  const reloadAll = () => { card.reload(); statusHist.reload(); ruleHist.reload(); };

  const c = card.data;
  const isManager = hasRole('FINANCE_ADMIN', 'FINANCE_MANAGER', 'DEPARTMENT_MANAGER');
  const isHolder = c?.holderId === me?.id;
  const live = c && (c.status === 'ACTIVE' || c.status === 'FROZEN');
  const canUnfreeze = c?.status === 'FROZEN' && isManager && (!isHolder || isFinance);

  const [revealErr, setRevealErr] = useState<string[] | null>(null);
  const alertError = (e: unknown) => setRevealErr(errorText(e));
  const reveal = async () => {
    try { const r = await api.revealCard(id); setRevealed(r.pan); } catch (e) { alertError(e); }
  };

  return (
    <>
      <PageHeader
        feature="F6 · Spending rules   ·   F7 · Card lifecycle"
        title={c?.nickname ?? 'Card'}
        subtitle={c ? `${c.holderName} · ${c.departmentName}` : undefined}
        actions={<Link to="/cards" className="btn">← All cards</Link>}
      />
      <ErrorBox errors={card.error ?? revealErr} />
      {c && (
        <>
          <div className="card-hero">
            <div>
              <CardVisual nickname={c.nickname} number={revealed ?? `••••••••••••${c.last4}`} expiry={`${String(c.expiryMonth).padStart(2, '0')}/${String(c.expiryYear).slice(-2)}`} holder={c.holderName} type={c.type} status={c.status} />
              {live && !revealed && (isHolder || isManager) && <button className="btn btn-sm mt" onClick={reveal}>Reveal card number</button>}
              {revealed && <p className="muted small mt">Number revealed. This action was recorded in the audit log.</p>}
            </div>
            <div className="hero-side">
              <div className="hero-status"><CardStatusBadge status={c.status} /> <span className="muted small">{c.type === 'SINGLE_USE' ? `Valid until ${dateTime(c.expiresAt)}` : `Valid through ${String(c.expiryMonth).padStart(2, '0')}/${c.expiryYear}`}</span></div>
              <SpendBars card={c} />
              <div className="lifecycle-actions">
                {c.status === 'ACTIVE' && <button className="btn" onClick={() => setAction('freeze')}>Freeze</button>}
                {canUnfreeze && <button className="btn" onClick={() => setAction('unfreeze')}>Unfreeze</button>}
                {c.status === 'FROZEN' && isHolder && !isFinance && <span className="muted small">Ask your manager to unfreeze this card.</span>}
                {live && isManager && <button className="btn btn-danger-ghost" onClick={() => setAction('terminate')}>Terminate</button>}
                {!live && <span className="muted small">This card is {c.status.toLowerCase()} and can no longer be used or changed.</span>}
              </div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h2>Spending rules</h2>
              {live && isManager && !editing && <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit rules</button>}
            </div>
            {!editing && <ul className="rule-list">{describeRules(c.rules, (n) => money(n)).map((r) => <li key={r}>{r}</li>)}</ul>}
            {editing && <EditRules card={c} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reloadAll(); }} />}
          </section>

          <div className="grid-2 gap-lg">
            <section className="panel">
              <h2>Status history</h2>
              <ol className="timeline">
                {statusHist.data?.map((h) => (
                  <li key={h.id}>
                    <div><CardStatusBadge status={h.toStatus} /> {h.fromStatus && <span className="muted small">from {h.fromStatus}</span>}</div>
                    <div className="small">{h.reason ?? '—'}</div>
                    <div className="muted small">{h.actor} · {dateTime(h.createdAt)}</div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="panel">
              <h2>Rule history</h2>
              <ol className="timeline">
                {ruleHist.data?.map((h, i) => (
                  <li key={h.id}>
                    <div className="strong small">{i === ruleHist.data!.length - 1 ? 'Rules at issuance' : 'Rules changed'}</div>
                    <div className="small">{describeRules(h.newRules, (n) => money(n, '')).join(' · ')}</div>
                    <div className="muted small">{h.changedBy} · {dateTime(h.createdAt)}</div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
      {c && action && <StatusAction card={c} action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); reloadAll(); }} />}
    </>
  );
}

function SpendBars({ card }: { card: CardDetail }) {
  const rows: [string, number, number | null | undefined][] = [
    ['Today', card.spend.today, card.rules.dailyLimit],
    ['This month', card.spend.thisMonth, card.rules.monthlyLimit],
    ['Lifetime', card.spend.lifetime, card.rules.lifetimeLimit],
  ];
  return (
    <div className="spend-bars">
      {rows.map(([label, spent, limit]) => {
        const pct = limit ? Math.min(100, (spent / limit) * 100) : 0;
        return (
          <div key={label} className="spend-row">
            <div className="spend-label"><span>{label}</span><span>{money(spent)}{limit ? <span className="muted"> / {money(limit, '')}</span> : <span className="muted"> · no limit</span>}</span></div>
            {limit ? <div className="bar"><div className={`bar-fill ${pct >= 90 ? 'hot' : ''}`} style={{ width: `${pct}%` }} /></div> : null}
          </div>
        );
      })}
    </div>
  );
}

function EditRules({ card, onCancel, onSaved }: { card: CardDetail; onCancel: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(draftFromRules(card.rules));
  const { busy, errors, run } = useSubmit();
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api.updateRules(card.id, rulesFromDraft(draft)); onSaved(); }); }}>
      <ErrorBox errors={errors} />
      <RulesEditor value={draft} onChange={setDraft} cardType={card.type} />
      <div className="modal-actions"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={busy}>Save rules</button></div>
    </form>
  );
}

function StatusAction({ card, action, onClose, onDone }: { card: CardDetail; action: 'freeze' | 'unfreeze' | 'terminate'; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, errors, run } = useSubmit();
  const text = {
    freeze: 'The card is blocked immediately. All payments will be declined until it is unfrozen.',
    unfreeze: 'The card becomes usable again with its existing rules.',
    terminate: 'Permanent: a terminated card can never be used or reactivated.',
  }[action];
  const go = () => run(async () => {
    if (action === 'freeze') await api.freezeCard(card.id, reason || undefined);
    if (action === 'unfreeze') await api.unfreezeCard(card.id, reason || undefined);
    if (action === 'terminate') await api.terminateCard(card.id, reason);
    onDone();
  });
  return (
    <Modal title={`${action[0].toUpperCase()}${action.slice(1)} "${card.nickname}"?`} onClose={onClose}>
      <ErrorBox errors={errors} />
      <p>{text}</p>
      <Field label={action === 'terminate' ? 'Reason (required)' : 'Reason (optional)'}>
        <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={action === 'terminate' ? 3 : 0} autoFocus />
      </Field>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${action === 'terminate' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || (action === 'terminate' && reason.trim().length < 3)} onClick={go}>
          {action === 'terminate' ? 'Terminate card' : action === 'freeze' ? 'Freeze card' : 'Unfreeze card'}
        </button>
      </div>
      <p className="muted small"><Badge value={card.status} /> → <Badge value={action === 'freeze' ? 'FROZEN' : action === 'unfreeze' ? 'ACTIVE' : 'TERMINATED'} /></p>
    </Modal>
  );
}
