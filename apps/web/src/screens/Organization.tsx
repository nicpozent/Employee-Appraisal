import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Appraisal } from '../lib/types';
import { Kpi, Card, StatusChip, EmptyState } from '../components/ui';

export function Organization() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const roles = me!.roles;
  const cfoOnly = roles.includes('cfo') && !roles.some((r) => ['cto', 'cio', 'md'].includes(r));

  const [org, setOrg] = useState<string>('all');
  const { data: appraisals = [], isLoading } = useQuery({
    queryKey: ['appraisals'],
    queryFn: () => api.get<Appraisal[]>('/appraisals'),
  });

  const orgs = useMemo(() => {
    const set = new Set<string>();
    for (const a of appraisals) {
      const o = a.employee?.org;
      if (o) set.add(o);
    }
    return Array.from(set).sort();
  }, [appraisals]);

  const rows = org === 'all' ? appraisals : appraisals.filter((a) => a.employee?.org === org);

  const participants = appraisals.length;
  const completed = appraisals.filter((a) => a.signed || a.status === 'approved').length;
  const inReview = appraisals.filter((a) => a.status === 'submitted').length;
  const scored = appraisals.filter((a) => a.managerScore != null);
  const avg = scored.length
    ? String(Math.round(scored.reduce((s, a) => s + (a.managerScore ?? 0), 0) / scored.length))
    : '—';

  return (
    <div className="stack">
      {cfoOnly && (
        <div className="notice">Read-only view of finished (approved &amp; signed) appraisals.</div>
      )}

      <div className="grid grid-4">
        <Kpi label="Participants" value={participants} />
        <Kpi label="Completed" value={completed} />
        <Kpi label="In review" value={inReview} />
        <Kpi label="Avg score" value={avg} />
      </div>

      <div className="filter-bar">
        <button
          type="button"
          className={`filter-btn${org === 'all' ? ' on' : ''}`}
          onClick={() => setOrg('all')}
        >
          All
          <span className="n">{appraisals.length}</span>
        </button>
        {orgs.map((o) => (
          <button
            key={o}
            type="button"
            className={`filter-btn${org === o ? ' on' : ''}`}
            onClick={() => setOrg(o)}
          >
            {o}
            <span className="n">{appraisals.filter((a) => a.employee?.org === o).length}</span>
          </button>
        ))}
      </div>

      <Card pad={false}>
        {isLoading ? (
          <div className="card-pad">
            <p className="muted">Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="card-pad">
            <EmptyState title={cfoOnly ? 'No finished appraisals yet' : 'Nothing in scope yet'} icon="◔">
              {cfoOnly
                ? 'Approved and signed appraisals appear here once completed.'
                : 'Appraisals across the organization appear here once they are created.'}
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Reviewed by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    style={cfoOnly ? undefined : { cursor: 'pointer' }}
                    onClick={cfoOnly ? undefined : () => navigate(`/reviews/${a.id}`)}
                  >
                    <td style={{ fontWeight: 600 }}>{a.employee?.displayName ?? '—'}</td>
                    <td>{a.employee?.department ?? '—'}</td>
                    <td>
                      {a.template?.name ? <span className="tag">{a.template.name}</span> : '—'}
                    </td>
                    <td>
                      <StatusChip status={a.status} signed={a.signed} />
                    </td>
                    <td className="mono">{a.managerScore ?? '—'}</td>
                    <td>{a.manager?.displayName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
