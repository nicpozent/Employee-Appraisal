import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, EmptyState, Bar, StatusChip } from '../components/ui';

interface Analytics {
  total: number;
  avgScoreByDepartment: { dept: string; avg: number }[];
  completionByStatus: { status: string; count: number }[];
  distribution: { bucket: string; count: number }[];
  competencyHeat: { competency: string; section: string; avg: number; count: number }[];
}

/* Heat cell background from a 1–5 rating (accent-050 → accent). */
function heatBg5(v: number): string {
  const t = Math.max(0, Math.min(4, v - 1)) / 4;
  return `color-mix(in srgb, var(--accent) ${Math.round(t * 100)}%, var(--accent-050))`;
}

export function Analytics() {
  useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get<Analytics>('/analytics'),
  });

  const total = data?.total ?? 0;
  const empty = !isLoading && total === 0;
  const emptyState = (
    <EmptyState title="No analytics yet" icon="◔">
      Data appears once appraisals are scored.
    </EmptyState>
  );

  const deptRows = data?.avgScoreByDepartment ?? [];
  const statusRows = data?.completionByStatus ?? [];
  const distRows = data?.distribution ?? [];
  const heatRows = data?.competencyHeat ?? [];
  const maxDist = Math.max(1, ...distRows.map((d) => d.count));

  return (
    <div className="stack">
      {isLoading && <p className="muted">Loading…</p>}
      <div className="grid grid-2">
        <Card title="Average score by department">
          {empty ? (
            emptyState
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {deptRows.map((d) => (
                <div key={d.dept}>
                  <div className="spread" style={{ marginBottom: 4 }}>
                    <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{d.dept}</span>
                    <span className="mono">{Math.round(d.avg)}</span>
                  </div>
                  <Bar pct={d.avg} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Cycle completion">
          {empty ? (
            emptyState
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {statusRows.map((s) => (
                <div key={s.status}>
                  <div className="spread" style={{ marginBottom: 4 }}>
                    <StatusChip status={s.status} />
                    <span className="mono">{s.count}</span>
                  </div>
                  <Bar pct={total ? (s.count / total) * 100 : 0} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Competency heat">
          {empty || heatRows.length === 0 ? (
            heatRows.length === 0 && !empty ? (
              <EmptyState title="No manager ratings yet" icon="◔">Competency cells appear once managers have scored appraisals.</EmptyState>
            ) : emptyState
          ) : (
            <>
              <p className="muted" style={{ fontSize: 'var(--t-sm)', marginBottom: 12 }}>
                Average manager rating (1–5) per competency across the organization.
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {heatRows.map((c) => (
                  <div key={`${c.section}·${c.competency}`} className="row" style={{ gap: 10 }}>
                    <div
                      style={{
                        background: heatBg5(c.avg),
                        borderRadius: 'var(--r-sm)',
                        width: 44,
                        textAlign: 'center',
                        padding: '6px 0',
                        flex: 'none',
                        fontWeight: 700,
                      }}
                      className="mono"
                      title={`n=${c.count}`}
                    >
                      {c.avg.toFixed(1)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--t-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.competency}</div>
                      <div className="muted" style={{ fontSize: 'var(--t-2xs)' }}>{c.section}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title="Calibration & distribution">
          {empty ? (
            emptyState
          ) : (
            <div className="row" style={{ alignItems: 'flex-end', gap: 12, height: 180 }}>
              {distRows.map((d) => (
                <div key={d.bucket} style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    style={{
                      height: `${(d.count / maxDist) * 140}px`,
                      background: 'var(--accent)',
                      borderRadius: '6px 6px 0 0',
                      minHeight: d.count > 0 ? 4 : 0,
                    }}
                  />
                  <div className="mono" style={{ fontSize: 'var(--t-xs)', marginTop: 4 }}>{d.count}</div>
                  <div className="muted" style={{ fontSize: 'var(--t-2xs)' }}>{d.bucket}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
