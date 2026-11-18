import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { CATEGORIES, CATEGORY_LABEL, type ChargeResult, type MerchantCategory } from '../api/types';
import { Badge, dateTime, Empty, ErrorBox, Field, money, PageHeader, useLoad, useSubmit } from '../components/ui';

const PRESETS: { label: string; merchantName: string; merchantCategory: MerchantCategory; amount: number }[] = [
  { label: 'AWS bill', merchantName: 'AWS', merchantCategory: 'CLOUD', amount: 12500 },
  { label: 'GitHub seat', merchantName: 'GitHub', merchantCategory: 'SAAS', amount: 2100 },
  { label: 'Figma', merchantName: 'Figma', merchantCategory: 'SAAS', amount: 1500 },
  { label: 'Meta Ads', merchantName: 'Meta Ads', merchantCategory: 'ADVERTISING', amount: 8000 },
  { label: 'Hotel night', merchantName: 'Pan Pacific Sonargaon', merchantCategory: 'TRAVEL', amount: 11000 },
  { label: 'Laptop', merchantName: 'Star Tech', merchantCategory: 'ELECTRONICS', amount: 145000 },
];

/** F8 – Payment simulator: plays the merchant and shows the authorization engine's decision. */
export default function SimulatorPage() {
  const cards = useLoad(() => api.cards());
  const recent = useLoad(() => api.transactions(15));
  const [f, setF] = useState({ cardNumber: '', expiry: '', cvv: '', merchantName: '', merchantCategory: 'SAAS' as MerchantCategory, amount: '', useTime: false, simulatedAt: '' });
  const [result, setResult] = useState<ChargeResult | null>(null);
  const [pickErr, setPickErr] = useState<string[] | null>(null);
  const { busy, errors, run } = useSubmit();

  const pickCard = async (id: string) => {
    setPickErr(null);
    if (!id) return;
    try {
      const r = await api.revealCard(id);
      setF((x) => ({ ...x, cardNumber: r.pan, expiry: `${String(r.expiryMonth).padStart(2, '0')}/${String(r.expiryYear).slice(-2)}`, cvv: '' }));
    } catch (e) { setPickErr([String((e as Error).message)]); }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const [mm, yy] = f.expiry.split('/').map((s) => s.trim());
    run(async () => {
      const r = await api.charge({
        cardNumber: f.cardNumber.replace(/\s/g, ''), expiryMonth: Number(mm), expiryYear: 2000 + Number(yy), cvv: f.cvv,
        merchantName: f.merchantName, merchantCategory: f.merchantCategory, amount: Number(f.amount),
        simulatedAt: f.useTime && f.simulatedAt ? new Date(f.simulatedAt).toISOString() : undefined,
      });
      setResult(r);
      recent.reload();
      cards.reload();
    });
  };

  return (
    <>
      <PageHeader feature="F8 · Real-time authorization engine" title="Payment simulator"
        subtitle="Acts as an online shop's checkout. Every attempt runs through the rule chain before any money leaves the department wallet." />
      <div className="sim-grid">
        <form className="panel" onSubmit={submit}>
          <h2>Checkout</h2>
          <ErrorBox errors={errors ?? pickErr} />
          <Field label="Fill from one of your cards" hint="Fills number and expiry; type the CVV yourself, just like a real checkout">
            <select defaultValue="" onChange={(e) => pickCard(e.target.value)}>
              <option value="">— type the details manually —</option>
              {cards.data?.filter((c) => c.status === 'ACTIVE' || c.status === 'FROZEN').map((c) => <option key={c.id} value={c.id}>{c.nickname} · •••• {c.last4} ({c.holderName})</option>)}
            </select>
          </Field>
          <div className="grid-3">
            <Field label="Card number"><input className="mono" value={f.cardNumber} onChange={(e) => setF({ ...f, cardNumber: e.target.value })} required pattern="[0-9 ]{16,19}" placeholder="4532 0000 0000 0000" /></Field>
            <Field label="Expiry (MM/YY)"><input className="mono" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} required pattern="\d{2}/\d{2}" placeholder="11/29" /></Field>
            <Field label="CVV"><input className="mono" value={f.cvv} onChange={(e) => setF({ ...f, cvv: e.target.value })} required pattern="\d{3}" placeholder="123" /></Field>
          </div>
          <div className="presets">
            {PRESETS.map((p) => <button type="button" key={p.label} className="chip" onClick={() => setF({ ...f, merchantName: p.merchantName, merchantCategory: p.merchantCategory, amount: String(p.amount) })}>{p.label}</button>)}
          </div>
          <div className="grid-3">
            <Field label="Merchant"><input value={f.merchantName} onChange={(e) => setF({ ...f, merchantName: e.target.value })} required /></Field>
            <Field label="Category (MCC)">
              <select value={f.merchantCategory} onChange={(e) => setF({ ...f, merchantCategory: e.target.value as MerchantCategory })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </Field>
            <Field label="Amount (BDT)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
          </div>
          <label className="check-inline"><input type="checkbox" checked={f.useTime} onChange={(e) => setF({ ...f, useTime: e.target.checked })} /> Test the day/time rule at another moment (demo aid)</label>
          {f.useTime && <Field label="Pretend the purchase happens at" hint="Your browser's local time. Affects only the day/time check."><input type="datetime-local" value={f.simulatedAt} onChange={(e) => setF({ ...f, simulatedAt: e.target.value })} required /></Field>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Authorizing…' : 'Pay'}</button>
        </form>

        <section className={`panel result ${result ? (result.status === 'APPROVED' ? 'ok' : 'no') : ''}`}>
          <h2>Authorization result</h2>
          {!result && <Empty>Submit a payment to see each check in the chain.</Empty>}
          {result && (
            <>
              <div className="verdict">
                <Badge value={result.status} />
                <span className="verdict-amount">{money(result.amount)}</span>
                <span className="muted">at {result.merchantName}</span>
              </div>
              {result.status === 'DECLINED' && <p className="decline-reason"><span className="mono">{result.declineCode}</span><br />{result.message}</p>}
              {result.status === 'APPROVED' && result.walletBalanceAfter !== null && <p className="muted">Department wallet balance now {money(result.walletBalanceAfter)}{result.cardStatusAfter === 'BURNED' ? ' · single-use card burned' : ''}</p>}
              <ol className="chain">
                {result.checkTrace.map((c, i) => (
                  <li key={i} className={c.passed ? 'pass' : 'fail'}>
                    <span className="chain-mark">{c.passed ? '✓' : '✕'}</span>
                    <div><div className="strong">{c.check}</div><div className="muted small">{c.detail}</div></div>
                  </li>
                ))}
              </ol>
              {result.checkTrace.length < 9 && <p className="muted small">The chain stops at the first failed check; later checks did not run.</p>}
            </>
          )}
        </section>
      </div>

      <section className="panel flush">
        <div className="panel-head pad"><h2>Recent attempts</h2><span className="muted small">Full search and filters arrive with F9</span></div>
        <ErrorBox errors={recent.error} />
        {recent.data && recent.data.length === 0 && <Empty>No attempts yet.</Empty>}
        {recent.data && recent.data.length > 0 && (
          <table className="table">
            <thead><tr><th>When</th><th>Card</th><th>Merchant</th><th className="num">Amount</th><th>Result</th></tr></thead>
            <tbody>
              {recent.data.map((t) => (
                <tr key={t.id}>
                  <td className="nowrap small">{dateTime(t.createdAt)}</td>
                  <td>{t.cardNickname ?? <span className="muted">unknown</span>}<div className="muted small mono">•••• {t.cardLast4}</div></td>
                  <td>{t.merchantName}<div className="muted small">{CATEGORY_LABEL[t.merchantCategory]}</div></td>
                  <td className="num">{money(t.amount, t.currency)}</td>
                  <td><Badge value={t.status} />{t.declineMessage && <div className="muted small">{t.declineMessage}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
