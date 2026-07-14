import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Kpi, Card, EmptyState } from '../components/ui';

interface SecurityData {
  summary: {
    controlsImplemented: number;
    controlsTotal: number;
    iso27001: string;
    nis2: string;
    auditChain: { ok: boolean; count: number; brokenAt?: string };
  };
  controls: {
    framework: string;
    code: string;
    control: string;
    how: string;
    status: 'Met' | 'Partial' | 'Monitored';
  }[];
  architecture: { area: string; detail: string }[];
}

const STATUS_CLS: Record<string, string> = {
  Met: 'st-compliant',
  Partial: 'st-enriching',
  Monitored: 'st-published',
};

export function Security() {
  const { data, isLoading } = useQuery({
    queryKey: ['security'],
    queryFn: () => api.get<SecurityData>('/security'),
  });

  if (isLoading) return <p className="muted">Loading…</p>;
  if (!data) return <EmptyState title="No security data available" icon="◔" />;

  const { summary, controls, architecture } = data;
  const chain = summary.auditChain;

  return (
    <div className="stack">
      {/* Summary metrics */}
      <div className="grid grid-3">
        <Kpi label="Controls implemented" value={`${summary.controlsImplemented}/${summary.controlsTotal}`} />
        <Kpi label="ISO 27001" value={summary.iso27001} />
        <Kpi label="NIS2 readiness" value={summary.nis2} />
      </div>

      <div className="row">
        {chain.ok ? (
          <span className="chip st-compliant">Chain intact ({chain.count})</span>
        ) : (
          <span className="chip st-uncategorized">Chain broken{chain.brokenAt ? ` at ${chain.brokenAt}` : ''}</span>
        )}
      </div>

      {/* Control framework mapping */}
      <Card title="Control framework mapping" pad={false}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Framework</th>
                <th>Control</th>
                <th>How it's met</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((c, i) => (
                <tr key={`${c.framework}-${c.code}-${i}`}>
                  <td><span className="pill">{c.framework}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.control}</div>
                    <div className="muted mono" style={{ fontSize: 'var(--t-xs)' }}>{c.code}</div>
                  </td>
                  <td>{c.how}</td>
                  <td><span className={`chip ${STATUS_CLS[c.status] ?? 'st-staged'}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Architecture & controls overview */}
      <Card title="Architecture & controls overview">
        <div className="grid grid-3">
          {architecture.map((a) => (
            <div key={a.area} className="card" style={{ boxShadow: 'none' }}>
              <div className="card-pad">
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{a.area}</div>
                <div className="muted" style={{ fontSize: 'var(--t-sm)' }}>{a.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
