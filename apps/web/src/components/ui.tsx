import { ReactNode } from 'react';

/* Status chip mapping (§4). */
const STATUS: Record<string, { cls: string; label: string }> = {
  not_started: { cls: 'st-staged', label: 'Not started' },
  in_progress: { cls: 'st-enriching', label: 'In progress' },
  submitted: { cls: 'st-published', label: 'Awaiting review' },
  changes_requested: { cls: 'st-uncategorized', label: 'Changes requested' },
  approved: { cls: 'st-compliant', label: 'Approved' },
  rejected: { cls: 'st-uncategorized', label: 'Rejected' },
  signed: { cls: 'st-signed', label: 'Finalized & signed' },
};

export function StatusChip({ status, signed }: { status: string; signed?: boolean }) {
  const key = signed ? 'signed' : status;
  const s = STATUS[key] ?? { cls: 'st-staged', label: status };
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}

export function EmptyState({ icon = '◔', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="emptystate">
      <div className="ic">{icon}</div>
      <h4>{title}</h4>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

export function Card({ title, actions, children, pad = true }: { title?: string; actions?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <div className="card">
      {title && (
        <div className="card-head">
          <div className="card-title">{title}</div>
          <div className="grow" style={{ flex: 1 }} />
          {actions}
        </div>
      )}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </div>
  );
}

export function Bar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="bartrack">
      <div className="barfill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function Rating({ value, onChange, disabled }: { value?: number; onChange?: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="rate">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={value === n ? 'on' : ''} disabled={disabled} onClick={() => onChange?.(n)} type="button">
          {n}
        </button>
      ))}
    </div>
  );
}

export function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
