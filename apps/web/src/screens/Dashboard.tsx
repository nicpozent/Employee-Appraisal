import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Appraisal, Template, Cycle } from '../lib/types';
import { Kpi, Card, StatusChip, EmptyState, Bar, fmtDate } from '../components/ui';

export function Dashboard() {
  const { me } = useAuth();
  const roles = me!.roles;
  const isAdmin = roles.includes('admin') && roles.length === 1;
  if (isAdmin) return <AdminDashboard />;
  return <StandardDashboard />;
}

function heroFor(roles: string[], counts: { toReview: number; completePct: number; approved: number }) {
  if (roles.includes('it_manager')) return { kicker: 'Manager', title: `${counts.toReview} appraisals to review`, desc: 'Complete your mirrored reviews and decisions for your team.', cta: 'Team reviews', to: '/reviews' };
  if (roles.some((r) => ['cto', 'cio'].includes(r))) return { kicker: 'Executive', title: `IT cycle is ${counts.completePct}% complete`, desc: 'Track completion and calibration across the IT organization.', cta: 'Organization', to: '/organization' };
  if (roles.includes('cfo')) return { kicker: 'Finance', title: `${counts.approved} finished appraisals`, desc: 'Read-only view of approved and finalized appraisals.', cta: 'Finished appraisals', to: '/organization' };
  if (roles.includes('md')) return { kicker: 'Group', title: 'Group cycle overview', desc: 'Overview of appraisal progress across the whole organization.', cta: 'Organization', to: '/organization' };
  return { kicker: 'Your appraisal', title: 'Complete your self-assessment', desc: 'Rate yourself against your role template and submit for manager review.', cta: 'My appraisal', to: '/my-appraisal' };
}

function StandardDashboard() {
  const { me } = useAuth();
  const roles = me!.roles;
  const [view, setView] = useState<'briefing' | 'metrics'>('briefing');
  const { data: appraisals = [], isLoading } = useQuery({ queryKey: ['appraisals'], queryFn: () => api.get<Appraisal[]>('/appraisals') });

  const mine = appraisals.find((a) => a.employeeId === me!.id);
  const toReview = appraisals.filter((a) => a.status === 'submitted' && a.managerId === me!.id).length;
  const approved = appraisals.filter((a) => a.status === 'approved' || a.signed).length;
  const done = appraisals.filter((a) => a.signed || a.status === 'approved').length;
  const completePct = appraisals.length ? Math.round((done / appraisals.length) * 100) : 0;
  const hero = heroFor(roles, { toReview, completePct, approved });

  const isExec = roles.some((r) => ['cto', 'cio', 'md', 'cfo'].includes(r));
  const isManager = roles.includes('it_manager');

  const byStatus = appraisals.reduce<Record<string, number>>((m, a) => { const k = a.signed ? 'signed' : a.status; m[k] = (m[k] ?? 0) + 1; return m; }, {});

  return (
    <div className="stack">
      <div className="hero">
        <div className="kicker">{hero.kicker}</div>
        <h2>{hero.title}</h2>
        <p>{hero.desc}</p>
        <Link to={hero.to} className="btn btn-white">{hero.cta} →</Link>
      </div>

      <div className="grid grid-4">
        {isManager ? (
          <>
            <Kpi label="Team members" value={new Set(appraisals.map((a) => a.employeeId)).size} />
            <Kpi label="Awaiting review" value={toReview} />
            <Kpi label="Approved" value={approved} />
            <Kpi label="Avg score" value={avgScore(appraisals)} />
          </>
        ) : isExec ? (
          <>
            <Kpi label="Participants" value={appraisals.length} />
            <Kpi label="Completed" value={done} />
            <Kpi label="In review" value={appraisals.filter((a) => a.status === 'submitted').length} />
            <Kpi label="Avg score" value={avgScore(appraisals)} />
          </>
        ) : (
          <>
            <Kpi label="My status" value={mine ? <StatusChip status={mine.status} signed={mine.signed} /> : '—'} />
            <Kpi label="Completion" value={`${mine?.completionPct ?? 0}%`} />
            <Kpi label="Live score" value={`${mine?.employeeScore ?? 0}/100`} />
            <Kpi label="Days left" value="—" />
          </>
        )}
      </div>

      {!roles.includes('admin') && (
        <div className="spread">
          <div className="seg2">
            <button className={view === 'briefing' ? 'on' : ''} onClick={() => setView('briefing')}>Briefing</button>
            <button className={view === 'metrics' ? 'on' : ''} onClick={() => setView('metrics')}>Metrics</button>
          </div>
        </div>
      )}

      {view === 'briefing' ? (
        <div className="grid grid-2">
          <Card title="Appraisals in scope">
            {isLoading ? <p className="muted">Loading…</p> : appraisals.length === 0 ? (
              <EmptyState title="Nothing in scope yet" icon="◔">When appraisals are assigned to you or your team, they appear here.</EmptyState>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {appraisals.slice(0, 8).map((a) => (
                  <Link key={a.id} to={a.employeeId === me!.id ? '/my-appraisal' : `/reviews/${a.id}`} className="spread" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.employee?.displayName ?? 'You'}</div>
                      <div className="muted" style={{ fontSize: 'var(--t-xs)' }}>{a.employee?.department ?? me!.department} · {a.template?.name}</div>
                    </div>
                    <div className="row">
                      <StatusChip status={a.status} signed={a.signed} />
                      <span className="muted">›</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card title="Activity">
            <EmptyState title="No recent activity" icon="◔">Submissions, reviews and decisions will show up here.</EmptyState>
          </Card>
        </div>
      ) : (
        <div className="grid grid-2">
          <Card title="Completion by status">
            {Object.keys(byStatus).length === 0 ? <EmptyState title="No data" /> : (
              <div className="stack" style={{ gap: 10 }}>
                {Object.entries(byStatus).map(([s, n]) => (
                  <div key={s}><div className="spread" style={{ marginBottom: 4 }}><span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{s}</span><span className="mono">{n}</span></div><Bar pct={(n / appraisals.length) * 100} /></div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Average score by department">
            <DeptBars appraisals={appraisals} />
          </Card>
        </div>
      )}
    </div>
  );
}

function DeptBars({ appraisals }: { appraisals: Appraisal[] }) {
  const byDept: Record<string, { sum: number; n: number }> = {};
  for (const a of appraisals) { if (a.managerScore == null) continue; const d = a.employee?.department ?? '—'; byDept[d] = byDept[d] ?? { sum: 0, n: 0 }; byDept[d].sum += a.managerScore; byDept[d].n++; }
  const rows = Object.entries(byDept);
  if (rows.length === 0) return <EmptyState title="No scored appraisals yet" />;
  return <div className="stack" style={{ gap: 10 }}>{rows.map(([d, v]) => { const avg = Math.round(v.sum / v.n); return <div key={d}><div className="spread" style={{ marginBottom: 4 }}><span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{d}</span><span className="mono">{avg}</span></div><Bar pct={avg} /></div>; })}</div>;
}

function avgScore(appraisals: Appraisal[]): string {
  const scored = appraisals.filter((a) => a.managerScore != null);
  if (!scored.length) return '—';
  return String(Math.round(scored.reduce((s, a) => s + (a.managerScore ?? 0), 0) / scored.length));
}

function AdminDashboard() {
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Template[]>('/templates') });
  const { data: cycles = [] } = useQuery({ queryKey: ['cycles'], queryFn: () => api.get<Cycle[]>('/cycles') });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => api.get<any[]>('/users') });
  const activeCycles = cycles.filter((c) => c.status === 'active');

  return (
    <div className="stack">
      <div className="notice notice-warn">Platform Administrator: appraisal answers, scores and comments are never visible to this role. Your scope is configuration and scheduling only.</div>
      <div className="hero">
        <div className="kicker">Administration</div>
        <h2>Platform configuration</h2>
        <p>Manage templates, cycles, users and roles, security and compliance — without access to appraisal content.</p>
        <Link to="/templates" className="btn btn-white">Templates →</Link>
      </div>
      <div className="grid grid-4">
        <Kpi label="Templates" value={templates.length} />
        <Kpi label="Active cycles" value={activeCycles.length} />
        <Kpi label="Users" value={users.length} />
        <Kpi label="Controls" value="10" />
      </div>
      <div className="grid grid-2">
        <Card title="Active cycles">
          {activeCycles.length === 0 ? <EmptyState title="No cycles defined" icon="◔">Create a cycle to schedule appraisals and target dates.</EmptyState> : (
            <div className="stack" style={{ gap: 8 }}>
              {activeCycles.map((c) => (
                <Link key={c.id} to="/cycles" className="spread" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
                  <div><div style={{ fontWeight: 600 }}>{c.name}</div><div className="muted" style={{ fontSize: 'var(--t-xs)' }}>{c.scope} · target {fmtDate(c.targetDate)}</div></div>
                  <span className="chip st-published">{c.participants.length} participants</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card title="Admin activity"><EmptyState title="No recent activity" icon="◔">Configuration changes will appear here.</EmptyState></Card>
      </div>
    </div>
  );
}
