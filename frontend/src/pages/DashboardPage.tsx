import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Badge, CardStatusBadge, dateTime, Empty, ErrorBox, money, PageHeader, useLoad } from '../components/ui';

export default function DashboardPage() {
  const { me, hasRole } = useAuth();
  const canSeeWallets = hasRole('FINANCE_ADMIN', 'FINANCE_MANAGER', 'DEPARTMENT_MANAGER');
  const { data, error } = useLoad(async () => {
    const [wallets, cards, txs] = await Promise.all([canSeeWallets ? api.wallets() : Promise.resolve([]), api.cards(), api.transactions(8)]);
    return { wallets, cards, txs };
  });

  const treasury = data?.wallets.find((w) => w.type === 'TREASURY');
  const deptWallets = data?.wallets.filter((w) => w.type === 'DEPARTMENT' && w.departmentStatus === 'ACTIVE') ?? [];
  const activeCards = data?.cards.filter((c) => c.status === 'ACTIVE') ?? [];
  const spentMonth = data?.cards.reduce((s, c) => s + c.spentThisMonth, 0) ?? 0;

  return (
    <>
      <PageHeader title={`Hello, ${me?.name.split(' ')[0]}`} subtitle="What is happening with company spending right now." />
      <ErrorBox errors={error} />
      <div className="stats">
        {treasury && <div className="stat"><div className="stat-label">Treasury</div><div className="stat-value">{money(treasury.balance, treasury.currency)}</div></div>}
        {canSeeWallets && (
          <div className="stat">
            <div className="stat-label">{deptWallets.length === 1 ? `${deptWallets[0].departmentName} wallet` : 'In department wallets'}</div>
            <div className="stat-value">{money(deptWallets.reduce((s, w) => s + w.balance, 0))}</div>
          </div>
        )}
        <div className="stat"><div className="stat-label">Active cards</div><div className="stat-value">{activeCards.length}</div></div>
        <div className="stat"><div className="stat-label">Card spend this month</div><div className="stat-value">{money(spentMonth)}</div></div>
      </div>

      <div className="grid-2 gap-lg">
        <section className="panel">
          <div className="panel-head"><h2>Recent payment attempts</h2><Link to="/simulator">Open simulator →</Link></div>
          {data && data.txs.length === 0 && <Empty>No payments yet. Try the payment simulator.</Empty>}
          <table className="table">
            <tbody>
              {data?.txs.map((t) => (
                <tr key={t.id}>
                  <td><div className="strong">{t.merchantName}</div><div className="muted small nowrap">{t.cardNickname ?? 'Unknown card'} · •••• {t.cardLast4}</div></td>
                  <td className="num">{money(t.amount, t.currency)}</td>
                  <td><Badge value={t.status} />{t.declineCode && <div className="muted small">{t.declineCode.replace(/_/g, ' ').toLowerCase()}</div>}</td>
                  <td className="muted small nowrap">{dateTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{me?.role === 'EMPLOYEE' ? 'My cards' : 'Cards'}</h2><Link to="/cards">All cards →</Link></div>
          {data && data.cards.length === 0 && <Empty>No cards yet.</Empty>}
          <table className="table">
            <tbody>
              {data?.cards.slice(0, 8).map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/cards/${c.id}`} className="strong">{c.nickname}</Link><div className="muted small">{c.holderName} · {c.departmentName}</div></td>
                  <td className="num">{money(c.spentThisMonth)}<div className="muted small">{c.rules.monthlyLimit ? `of ${money(c.rules.monthlyLimit)}` : 'no monthly cap'}</div></td>
                  <td><CardStatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
