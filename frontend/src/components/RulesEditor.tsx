import { CATEGORIES, CATEGORY_LABEL, type CardRules, type CardType, type MerchantCategory, WEEKDAYS } from '../api/types';

/**
 * F6 – form for a card's spending rules. Pure View component: it only edits a CardRules object.
 * The backend CardRulesValidator decides whether the combination is valid.
 */
export interface RulesDraft {
  perTransactionLimit: string; dailyLimit: string; monthlyLimit: string; lifetimeLimit: string;
  allCategories: boolean; allowedCategories: MerchantCategory[];
  merchants: string;
  allDays: boolean; allowedDays: number[];
  anyTime: boolean; startHour: string; endHour: string;
}

export const draftFromRules = (r: CardRules = {}): RulesDraft => ({
  perTransactionLimit: r.perTransactionLimit?.toString() ?? '',
  dailyLimit: r.dailyLimit?.toString() ?? '',
  monthlyLimit: r.monthlyLimit?.toString() ?? '',
  lifetimeLimit: r.lifetimeLimit?.toString() ?? '',
  allCategories: !r.allowedCategories?.length,
  allowedCategories: r.allowedCategories ?? [],
  merchants: (r.allowedMerchants ?? []).join(', '),
  allDays: !r.allowedDays,
  allowedDays: r.allowedDays ?? [1, 2, 3, 4, 5],
  anyTime: !r.allowedHours,
  startHour: String(r.allowedHours?.start ?? 9),
  endHour: String(r.allowedHours?.end ?? 18),
});

const num = (s: string) => (s.trim() === '' ? null : Number(s));

export const rulesFromDraft = (d: RulesDraft): CardRules => ({
  perTransactionLimit: num(d.perTransactionLimit),
  dailyLimit: num(d.dailyLimit),
  monthlyLimit: num(d.monthlyLimit),
  lifetimeLimit: num(d.lifetimeLimit),
  allowedCategories: d.allCategories ? [] : d.allowedCategories,
  allowedMerchants: d.merchants.split(',').map((s) => s.trim()).filter(Boolean),
  ...(d.allDays ? {} : { allowedDays: d.allowedDays }),
  allowedHours: d.anyTime ? null : { start: Number(d.startHour), end: Number(d.endHour) },
});

export default function RulesEditor({ value, onChange, cardType }: { value: RulesDraft; onChange: (d: RulesDraft) => void; cardType: CardType }) {
  const set = (patch: Partial<RulesDraft>) => onChange({ ...value, ...patch });
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const lockedAmount = cardType !== 'STANDARD';
  const hours = Array.from({ length: 25 }, (_, h) => h);

  return (
    <div className="rules-editor">
      <div className="rules-section">
        <h3>Amount limits <span className="muted small">(BDT, blank = no limit)</span></h3>
        <div className="grid-4">
          <label className="field"><span className="field-label">Per transaction</span>
            <input type="number" min="0.01" step="0.01" value={value.perTransactionLimit} onChange={(e) => set({ perTransactionLimit: e.target.value })} required={cardType === 'SINGLE_USE'} /></label>
          <label className="field"><span className="field-label">Daily</span>
            <input type="number" min="0.01" step="0.01" value={value.dailyLimit} onChange={(e) => set({ dailyLimit: e.target.value })} /></label>
          <label className="field"><span className="field-label">Monthly</span>
            <input type="number" min="0.01" step="0.01" value={value.monthlyLimit} onChange={(e) => set({ monthlyLimit: e.target.value })} /></label>
          <label className="field"><span className="field-label">Lifetime</span>
            <input type="number" min="0.01" step="0.01" value={value.lifetimeLimit} onChange={(e) => set({ lifetimeLimit: e.target.value })} /></label>
        </div>
        <p className="field-hint">Must be ordered: per transaction ≤ daily ≤ monthly ≤ lifetime.{lockedAmount && ' Single-use and subscription cards keep their core amount.'}</p>
      </div>

      <div className="rules-section">
        <h3>Merchant categories (MCC lock)</h3>
        <label className="check-inline"><input type="checkbox" checked={value.allCategories} onChange={(e) => set({ allCategories: e.target.checked })} /> Allow every category</label>
        {!value.allCategories && (
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button type="button" key={c} className={`chip ${value.allowedCategories.includes(c) ? 'on' : ''}`} onClick={() => set({ allowedCategories: toggle(value.allowedCategories, c) })}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rules-section">
        <h3>Merchant names</h3>
        <label className="field">
          <span className="field-hint">{cardType === 'SUBSCRIPTION' ? 'Subscription cards stay locked to exactly one merchant.' : 'Comma-separated, e.g. Meta Ads, Google Ads. Leave empty for any merchant.'}</span>
          <input value={value.merchants} onChange={(e) => set({ merchants: e.target.value })} placeholder="Any merchant" />
        </label>
      </div>

      <div className="rules-section grid-2">
        <div>
          <h3>Days</h3>
          <label className="check-inline"><input type="checkbox" checked={value.allDays} onChange={(e) => set({ allDays: e.target.checked })} /> Every day</label>
          {!value.allDays && (
            <div className="chips">
              {WEEKDAYS.map((d) => (
                <button type="button" key={d.n} className={`chip ${value.allowedDays.includes(d.n) ? 'on' : ''}`} onClick={() => set({ allowedDays: toggle(value.allowedDays, d.n).sort() })}>{d.label}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3>Hours <span className="muted small">(company timezone)</span></h3>
          <label className="check-inline"><input type="checkbox" checked={value.anyTime} onChange={(e) => set({ anyTime: e.target.checked })} /> Any time</label>
          {!value.anyTime && (
            <div className="inline-fields">
              <select value={value.startHour} onChange={(e) => set({ startHour: e.target.value })}>{hours.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
              <span>to</span>
              <select value={value.endHour} onChange={(e) => set({ endHour: e.target.value })}>{hours.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Human-readable one-line summary of a rule set (used in lists and history). */
export function describeRules(r: CardRules, money: (n: number) => string): string[] {
  const out: string[] = [];
  if (r.perTransactionLimit) out.push(`≤ ${money(r.perTransactionLimit)} per payment`);
  if (r.dailyLimit) out.push(`${money(r.dailyLimit)}/day`);
  if (r.monthlyLimit) out.push(`${money(r.monthlyLimit)}/month`);
  if (r.lifetimeLimit) out.push(`${money(r.lifetimeLimit)} lifetime`);
  if (r.allowedCategories?.length) out.push(r.allowedCategories.map((c) => CATEGORY_LABEL[c]).join(', ') + ' only');
  if (r.allowedMerchants?.length) out.push(`Merchants: ${r.allowedMerchants.join(', ')}`);
  if (r.allowedDays) out.push(WEEKDAYS.filter((d) => r.allowedDays!.includes(d.n)).map((d) => d.label).join(' '));
  if (r.allowedHours) out.push(`${String(r.allowedHours.start).padStart(2, '0')}:00–${String(r.allowedHours.end).padStart(2, '0')}:00`);
  return out.length ? out : ['No restrictions'];
}
