import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Appraisal } from '../lib/types';
import { Card, StatusChip, EmptyState, fmtDate } from '../components/ui';

type FilterKey = 'all' | 'submitted' | 'changes_requested' | 'approved' | 'not_started';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Awaiting review' },
  { key: 'changes_requested', label: 'Changes requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'not_started', label: 'Not started' },
];

export function TeamReviews() {
  useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('all');
  const { data: appraisals = [], isLoading } = useQuery({
    queryKey: ['appraisals'],
    queryFn: () => api.get<Appraisal[]>('/appraisals'),
  });

  const count = (key: FilterKey) =>
    key === 'all' ? appraisals.length : appraisals.filter((a) => a.status === key).length;

  const rows = filter === 'all' ? appraisals : appraisals.filter((a) => a.status === filter);

  return (
    <div className="stack">
      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`filter-btn${filter === f.key ? ' on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="n">{count(f.key)}</span>
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
            <EmptyState title="No team appraisals yet" icon="◔">
              Appraisals for your team appear here once they are assigned in a cycle.
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/reviews/${a.id}`)}
                  >
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.employee?.displayName ?? '—'}</div>
                      <div className="muted" style={{ fontSize: 'var(--t-xs)' }}>
                        {a.employee?.department ?? '—'}
                      </div>
                    </td>
                    <td>
                      {a.template?.name ? <span className="tag">{a.template.name}</span> : '—'}
                    </td>
                    <td>
                      <StatusChip status={a.status} signed={a.signed} />
                    </td>
                    <td className="mono">{a.managerScore ?? '—'}</td>
                    <td className="mono">{fmtDate(a.cycle?.targetDate)}</td>
                    <td className="muted" style={{ textAlign: 'right' }}>
                      ›
                    </td>
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
