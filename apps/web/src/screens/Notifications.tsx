import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Notification } from '../lib/types';
import { Card, EmptyState, fmtDate } from '../components/ui';

const KIND_ICON: Record<string, string> = {
  submitted: '✉',
  approved: '✅',
  changes: '✏',
  rejected: '⛔',
  reminder: '⏰',
};

const KIND_CTA: Record<string, string> = {
  submitted: 'Open review',
  approved: 'Sign appraisal',
  changes: 'Edit appraisal',
  rejected: 'Contact manager',
  reminder: 'Complete now',
};

export function Notifications() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications'),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unread'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const select = (n: Notification) => {
    setSelectedId(n.id);
    if (!n.read) markRead.mutate(n.id);
  };

  const selected = notifications.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="grid grid-2">
      <Card title="Notification & email log" pad={false}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--t-sm)' }}>Sent via MS Graph</p>
        </div>
        {isLoading ? (
          <div className="card-pad"><p className="muted">Loading…</p></div>
        ) : notifications.length === 0 ? (
          <div className="card-pad">
            <EmptyState title="No notifications yet" icon="◔">
              Emails sent on submissions, decisions, sign-off and deadline changes appear here.
            </EmptyState>
          </div>
        ) : (
          <div className="stack" style={{ gap: 0, padding: '12px 12px 12px' }}>
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => select(n)}
                className="row"
                style={{
                  gap: 12,
                  textAlign: 'left',
                  alignItems: 'flex-start',
                  padding: '12px',
                  border: '1px solid',
                  borderColor: n.id === selectedId ? 'var(--accent)' : 'var(--line)',
                  background: n.id === selectedId ? 'var(--accent-050)' : 'var(--surface)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  marginBottom: 8,
                  font: 'inherit',
                  color: 'inherit',
                  width: '100%',
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{KIND_ICON[n.kind] ?? '✉'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="spread" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>
                      {n.subject}
                      {!n.read && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 100, background: 'var(--red)', marginLeft: 8, verticalAlign: 'middle' }} />}
                    </span>
                  </div>
                  {n.preview && (
                    <div className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.preview}
                    </div>
                  )}
                  <div className="muted mono" style={{ fontSize: 'var(--t-xs)', marginTop: 4 }}>
                    {n.toEmail ?? '—'} · {fmtDate(n.sentAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Email preview">
        {selected ? (
          <div className="stack" style={{ gap: 0, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--navy)', color: '#fff', padding: '18px 22px', fontWeight: 700, letterSpacing: '.02em' }}>
              Biltema · Birgma
            </div>
            <div className="stack" style={{ gap: 14, padding: 22 }}>
              <h3 style={{ fontFamily: 'Archivo', fontSize: 'var(--t-h3)', margin: 0 }}>{selected.subject}</h3>
              <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--ink-2)', fontSize: 'var(--t-sm)' }}>
                {selected.body ?? selected.preview ?? 'You have a new update on your appraisal.'}
              </p>
              <div>
                <a href="#" className="btn btn-primary" onClick={(e) => e.preventDefault()}>
                  {KIND_CTA[selected.kind] ?? 'Open appraisal'}
                </a>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 'var(--t-xs)', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                Sent via Microsoft Graph · recorded in the audit log
              </p>
            </div>
          </div>
        ) : (
          <EmptyState title="No email selected" icon="✉">
            Select a notification from the log to preview the branded email that was sent.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
