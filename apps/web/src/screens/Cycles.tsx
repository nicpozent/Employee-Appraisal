import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Cycle, Template } from '../lib/types';
import { Card, EmptyState, Bar, fmtDate } from '../components/ui';

interface TeamMember { id: string; displayName: string; department?: string; org?: string; managerId?: string }

const STEP_PILL: Record<string, { cls: string; label: string }> = {
  complete: { cls: 'st-compliant', label: 'Complete' },
  in_progress: { cls: 'st-published', label: 'In progress' },
  upcoming: { cls: 'st-staged', label: 'Upcoming' },
};

const CYCLE_STATUS: Record<string, { cls: string; label: string }> = {
  active: { cls: 'st-published', label: 'Active' },
  draft: { cls: 'st-staged', label: 'Draft' },
  closed: { cls: 'st-compliant', label: 'Closed' },
};

const EXTEND_OPTS: { days: 7 | 14 | 30; label: string }[] = [
  { days: 7, label: '+1 week' },
  { days: 14, label: '+2 weeks' },
  { days: 30, label: '+1 month' },
];

const DEFAULT_STEP_LABELS = ['Self-assessment', 'Manager review', 'Calibration', 'Sign-off'];

export function Cycles() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const roles = me?.roles ?? [];
  const canManage = roles.includes('admin') || roles.includes('it_manager');

  const [toast, setToast] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [extendTarget, setExtendTarget] = useState<{ cycle: Cycle; userId?: string; userLabel?: string } | null>(null);

  const { data: cycles = [], isLoading } = useQuery({
    queryKey: ['cycles'],
    queryFn: () => api.get<Cycle[]>('/cycles'),
  });
  const { data: team = [] } = useQuery({
    queryKey: ['me-team'],
    queryFn: () => api.get<TeamMember[]>('/me/team'),
    enabled: canManage,
  });

  const nameFor = (userId: string) => team.find((t) => t.id === userId)?.displayName ?? userId;

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="stack">
      {toast && <div className="toast">{toast}</div>}

      <div className="spread">
        <p className="muted" style={{ maxWidth: 640, margin: 0 }}>
          Cycles schedule appraisals across the group. Each cycle sets a target completion date and
          per-step deadlines (self-assessment, manager review, calibration, sign-off). Target dates can
          be extended for the whole cycle or for individual participants — affected people are notified.
        </p>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
            New cycle
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : cycles.length === 0 ? (
        <Card>
          <EmptyState title="No cycles defined" icon="◔">
            Create a cycle to schedule appraisals and set target completion dates.
          </EmptyState>
        </Card>
      ) : (
        cycles.map((c) => (
          <CycleCard
            key={c.id}
            cycle={c}
            canManage={canManage}
            nameFor={nameFor}
            onExtendCycle={() => setExtendTarget({ cycle: c })}
            onExtendUser={(userId, userLabel) => setExtendTarget({ cycle: c, userId, userLabel })}
          />
        ))
      )}

      {showNew && (
        <NewCycleModal
          team={team}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ['cycles'] });
            flash('Cycle created');
          }}
        />
      )}

      {extendTarget && (
        <ExtendModal
          cycle={extendTarget.cycle}
          userId={extendTarget.userId}
          userLabel={extendTarget.userLabel}
          onClose={() => setExtendTarget(null)}
          onExtended={() => {
            setExtendTarget(null);
            qc.invalidateQueries({ queryKey: ['cycles'] });
            flash('Target date extended — affected users notified');
          }}
        />
      )}
    </div>
  );
}

function CycleCard({
  cycle,
  canManage,
  nameFor,
  onExtendCycle,
  onExtendUser,
}: {
  cycle: Cycle;
  canManage: boolean;
  nameFor: (id: string) => string;
  onExtendCycle: () => void;
  onExtendUser: (userId: string, userLabel: string) => void;
}) {
  const status = CYCLE_STATUS[cycle.status] ?? { cls: 'st-staged', label: cycle.status };
  const steps = [...cycle.steps].sort((a, b) => a.order - b.order);
  const completeSteps = steps.filter((s) => s.state === 'complete').length;
  const pct = steps.length ? (completeSteps / steps.length) * 100 : 0;
  const isActive = cycle.status === 'active';

  return (
    <Card pad={false}>
      <div className="card-pad stack" style={{ gap: 16 }}>
        <div className="spread">
          <div>
            <div className="row" style={{ gap: 10 }}>
              <div className="card-title">{cycle.name}</div>
              <span className={`chip ${status.cls}`}>{status.label}</span>
            </div>
            <div className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 4 }}>
              {cycle.scope} · {cycle.participants.length} participant{cycle.participants.length === 1 ? '' : 's'}
            </div>
            <div className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 2 }}>
              Target completion: <span className="mono">{fmtDate(cycle.targetDate)}</span>
            </div>
          </div>
          {canManage && !cycle.closed && (
            <button type="button" className="btn btn-ghost" onClick={onExtendCycle}>
              Extend target date
            </button>
          )}
        </div>

        {steps.length > 0 && (
          <div className="steps">
            {steps.map((s) => {
              const pill = STEP_PILL[s.state] ?? { cls: 'st-staged', label: s.state };
              return (
                <div key={s.id} className={`step-tile${s.state === 'in_progress' ? ' on' : ''}`}>
                  <div className="spread" style={{ alignItems: 'flex-start' }}>
                    <span className="st-lbl">{s.label}</span>
                    <span className={`chip ${pill.cls}`}>{pill.label}</span>
                  </div>
                  <div className="st-date">{fmtDate(s.dueDate)}</div>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="spread" style={{ marginBottom: 4 }}>
            <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>Overall progress</span>
            <span className="mono">{Math.round(pct)}%</span>
          </div>
          <Bar pct={pct} />
        </div>
      </div>

      {isActive && cycle.participants.length > 0 && (
        <div className="table-wrap" style={{ borderRadius: 0, border: 0, borderTop: '1px solid var(--line)' }}>
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Team</th>
                <th>Due date</th>
                <th>Status</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {cycle.participants.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{nameFor(p.userId)}</td>
                  <td className="muted">{p.team ?? '—'}</td>
                  <td className="mono">{fmtDate(p.dueDate)}</td>
                  <td>{p.extended && <span className="chip st-enriching">Extended</span>}</td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onExtendUser(p.userId, nameFor(p.userId))}
                      >
                        Extend
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function NewCycleModal({
  team,
  onClose,
  onSaved,
}: {
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [steps, setSteps] = useState(DEFAULT_STEP_LABELS.map((label) => ({ label, dueDate: '' })));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<Template[]>('/templates'),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Cycle>('/cycles', {
        name: name.trim(),
        scope: scope.trim(),
        targetDate,
        steps: steps.map((s) => ({ label: s.label.trim(), dueDate: s.dueDate || null })),
        participants: Array.from(selected).map((userId) => {
          const m = team.find((t) => t.id === userId);
          return { userId, dueDate: targetDate || null, team: m?.department };
        }),
        templateId: templateId || undefined,
      }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create cycle'),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError('Cycle name is required.');
    if (!targetDate) return setError('Target completion date is required.');
    mutation.mutate();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <div className="card-title">New cycle</div>
        </div>
        <div className="card-pad stack" style={{ gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
          {error && <div className="notice notice-warn">{error}</div>}

          <div className="form-grid">
            <div className="field">
              <label htmlFor="cy-name">Cycle name</label>
              <input id="cy-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2026 Annual — IT" />
            </div>
            <div className="field">
              <label htmlFor="cy-scope">Scope</label>
              <input id="cy-scope" type="text" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. IT" />
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="cy-target">Target completion date</label>
              <input id="cy-target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cy-template">Template (optional)</label>
              <select id="cy-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">— None —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Step deadlines</label>
            <div className="stack" style={{ gap: 8 }}>
              {steps.map((s, i) => (
                <div key={i} className="form-grid" style={{ gap: 10 }}>
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))}
                  />
                  <input
                    type="date"
                    value={s.dueDate}
                    onChange={(e) => setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, dueDate: e.target.value } : p)))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Participants</label>
            {team.length === 0 ? (
              <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: 0 }}>No team members available to add.</p>
            ) : (
              <div className="stack" style={{ gap: 4, maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 9, padding: 8 }}>
                {team.map((m) => (
                  <label key={m.id} className="row" style={{ gap: 8, fontWeight: 400, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} style={{ width: 'auto' }} />
                    <span>{m.displayName}</span>
                    {m.department && <span className="muted" style={{ fontSize: 'var(--t-xs)' }}>· {m.department}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="card-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create cycle'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtendModal({
  cycle,
  userId,
  userLabel,
  onClose,
  onExtended,
}: {
  cycle: Cycle;
  userId?: string;
  userLabel?: string;
  onClose: () => void;
  onExtended: () => void;
}) {
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [error, setError] = useState<string | null>(null);
  const isUser = !!userId;

  const currentDate = isUser
    ? cycle.participants.find((p) => p.userId === userId)?.dueDate
    : cycle.targetDate;

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/cycles/${cycle.id}/extend`, isUser ? { scope: 'user', userId, days } : { scope: 'cycle', days }),
    onSuccess: onExtended,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to extend target date'),
  });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <div className="card-title">Extend target date</div>
        </div>
        <div className="card-pad stack" style={{ gap: 14 }}>
          {error && <div className="notice notice-warn">{error}</div>}
          <p className="muted" style={{ margin: 0, fontSize: 'var(--t-sm)' }}>
            {isUser ? (
              <>Extending the date for <strong>{userLabel}</strong> only — this participant will be flagged “Extended”.</>
            ) : (
              <>Extending the whole cycle shifts the completion date and every step and participant date.</>
            )}
          </p>
          <div>
            <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>Current date: </span>
            <span className="mono">{fmtDate(currentDate)}</span>
          </div>
          <div className="field">
            <label>Push forward by</label>
            <div className="filter-bar" style={{ marginBottom: 0 }}>
              {EXTEND_OPTS.map((o) => (
                <button
                  key={o.days}
                  type="button"
                  className={`filter-btn${days === o.days ? ' on' : ''}`}
                  onClick={() => setDays(o.days)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => { setError(null); mutation.mutate(); }} disabled={mutation.isPending}>
            {mutation.isPending ? 'Extending…' : 'Confirm extension'}
          </button>
        </div>
      </div>
    </div>
  );
}
