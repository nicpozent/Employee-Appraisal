import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AuditEvent } from '../lib/types';
import { Card, EmptyState, fmtDate } from '../components/ui';

interface VerifyResult { ok: boolean; count: number; brokenAt?: string }

function fmtTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AuditLog() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<AuditEvent[]>('/audit'),
  });
  const { data: verify } = useQuery({
    queryKey: ['audit', 'verify'],
    queryFn: () => api.get<VerifyResult>('/audit/verify'),
  });

  return (
    <div className="stack">
      <div className="notice">
        Immutable, append-only. Retained 24 months then auto-purged (ISO 27001 A.12.4 · NIS2 logging).
      </div>

      <div className="row">
        {verify?.ok ? (
          <span className="chip st-compliant">Hash chain verified</span>
        ) : verify ? (
          <span className="chip st-uncategorized">
            Hash chain broken{verify.brokenAt ? ` at ${verify.brokenAt}` : ''}
          </span>
        ) : null}
      </div>

      <Card pad={false}>
        {isLoading ? (
          <div className="card-pad"><p className="muted">Loading…</p></div>
        ) : events.length === 0 ? (
          <div className="card-pad">
            <EmptyState title="No audit events yet" icon="◔">
              Every state change in the platform is appended here as a tamper-evident record.
            </EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Object</th>
                  <th>Source IP</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.ts)} {fmtTime(e.ts)}</td>
                    <td>{e.actorName ?? '—'}</td>
                    <td><span className="tag mono">{e.action}</span></td>
                    <td className="mono muted">{e.objectRef ?? '—'}</td>
                    <td className="mono">{e.sourceIp ?? '—'}</td>
                    <td>
                      <span className={`chip ${e.result === 'success' ? 'st-compliant' : 'st-uncategorized'}`}>
                        {e.result}
                      </span>
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
