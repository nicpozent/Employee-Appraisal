import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Appraisal, Section } from '../lib/types';
import { Card, StatusChip, EmptyState, Rating, fmtDate } from '../components/ui';

const EDITABLE = ['not_started', 'in_progress', 'changes_requested'];
const TIMELINE = ['Self-assessment', 'Manager review', 'Calibration', 'Sign-off'];

interface Goal { objective: string; keyResult: string; status: string }

function currentStep(status: string, signed?: boolean): number {
  if (signed) return 3;
  if (EDITABLE.includes(status)) return 0;
  if (status === 'submitted') return 1;
  if (status === 'approved') return 3;
  return 0;
}

export function MyAppraisal() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  // local draft state
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [goals, setGoals] = useState<Goal[]>([]);

  const { data: list = [], isLoading: listLoading } = useQuery({
    queryKey: ['appraisals'],
    queryFn: () => api.get<Appraisal[]>('/appraisals'),
  });
  const mineStub = list.find((a) => a.employeeId === me!.id);
  const id = mineStub?.id;

  const { data: appraisal, isLoading: detailLoading } = useQuery({
    queryKey: ['appraisal', id],
    queryFn: () => api.get<Appraisal>(`/appraisals/${id}`),
    enabled: !!id,
  });

  // hydrate local draft when the detail arrives / changes
  useEffect(() => {
    if (!appraisal) return;
    setRatings({ ...(appraisal.employeeSelf?.ratings ?? {}) });
    setTexts({ ...(appraisal.employeeSelf?.texts ?? {}) });
    setGoals(((appraisal.employeeSelf?.goals ?? []) as Goal[]).map((g) => ({ objective: g.objective ?? '', keyResult: g.keyResult ?? '', status: g.status ?? 'On track' })));
  }, [appraisal]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const locked = !!appraisal && (appraisal.signed || !EDITABLE.includes(appraisal.status));

  const saveMut = useMutation({
    mutationFn: () => api.patch<Appraisal>(`/appraisals/${id}`, { ratings, texts, goals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appraisals'] });
      qc.invalidateQueries({ queryKey: ['appraisal', id] });
      setToast('Draft saved.');
    },
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      await api.patch<Appraisal>(`/appraisals/${id}`, { ratings, texts, goals });
      return api.post<Appraisal>(`/appraisals/${id}/submit`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appraisals'] });
      qc.invalidateQueries({ queryKey: ['appraisal', id] });
      setConfirmSubmit(false);
      setToast('Submitted for review.');
    },
  });

  const signMut = useMutation({
    mutationFn: (name: string) => api.post<Appraisal>(`/appraisals/${id}/sign`, { party: 'employee', name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appraisals'] });
      qc.invalidateQueries({ queryKey: ['appraisal', id] });
      setSignOpen(false);
      setToast('Appraisal signed.');
    },
  });

  if (listLoading || (id && detailLoading)) return <p className="muted">Loading…</p>;
  if (!id || !appraisal) {
    return <EmptyState title="No appraisal assigned yet" icon="◔">When a template and cycle are assigned to you, your self-assessment appears here.</EmptyState>;
  }

  const tpl = appraisal.template;
  const sections = [...(tpl?.sections ?? [])].sort((a, b) => a.order - b.order);
  const step = currentStep(appraisal.status, appraisal.signed);
  const cycleSteps = appraisal.cycle?.steps as { label: string; dueDate?: string; order: number }[] | undefined;
  const reviewer = appraisal.manager?.displayName ?? '—';
  const empSig = (appraisal.signatures ?? []).find((s) => s.party === 'employee');

  return (
    <div className="stack">
      {toast && <div className="toast">{toast}</div>}

      {/* Header */}
      <Card>
        <div className="spread" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="row" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 22 }}>{tpl?.name ?? 'Appraisal'}</h2>
              <StatusChip status={appraisal.status} signed={appraisal.signed} />
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 'var(--t-sm)' }}>
              {appraisal.cycle?.name ?? '—'} · Reviewer: {reviewer} · Due: {fmtDate(appraisal.cycle?.targetDate)}
            </div>
          </div>
          <div className="row" style={{ gap: 28 }}>
            <div>
              <div className="muted" style={{ fontSize: 'var(--t-2xs)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Live score</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{appraisal.employeeScore ?? 0}/100</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 'var(--t-2xs)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Complete</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{appraisal.completionPct ?? 0}%</div>
            </div>
          </div>
        </div>
      </Card>

      {/* 4-step timeline */}
      <div className="steps">
        {TIMELINE.map((label, i) => (
          <div key={label} className={`step-tile${i === step ? ' on' : ''}`}>
            <div className="st-lbl">{label}</div>
            <div className="st-date">{fmtDate(cycleSteps?.find((s) => s.order === i)?.dueDate ?? cycleSteps?.[i]?.dueDate)}</div>
          </div>
        ))}
      </div>

      {/* Sign-off block when approved */}
      {appraisal.status === 'approved' && !appraisal.signed && (
        <Card title="Electronic sign-off">
          <p className="muted" style={{ marginTop: 0 }}>Your appraisal was approved. Sign electronically to finalize and lock it.</p>
          {empSig ? (
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <span className="sig-name">{empSig.name}</span>
              <span className="chip st-compliant">Signed</span>
              <span className="muted mono" style={{ fontSize: 'var(--t-xs)' }}>{fmtDate(empSig.signedAt)} · {empSig.account}</span>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => setSignOpen(true)}>Sign</button>
          )}
        </Card>
      )}

      {/* Section cards */}
      {sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          locked={locked}
          ratings={ratings}
          texts={texts}
          goals={goals}
          onRate={(fid, v) => setRatings((m) => ({ ...m, [fid]: v }))}
          onText={(fid, v) => setTexts((m) => ({ ...m, [fid]: v }))}
          onGoals={setGoals}
        />
      ))}

      {/* Footer */}
      {!locked && (
        <Card>
          <div className="notice" style={{ marginBottom: 14 }}>
            On submit, your appraisal locks for editing and an MS Graph notification is sent to {reviewer} for review.
          </div>
          {confirmSubmit ? (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span>Submit for review? This locks your appraisal.</span>
              <button className="btn btn-primary" disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>Confirm submit</button>
              <button className="btn btn-ghost" onClick={() => setConfirmSubmit(false)}>Cancel</button>
            </div>
          ) : (
            <div className="row" style={{ gap: 10 }}>
              <button className="btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>Save draft</button>
              <button className="btn btn-primary" onClick={() => setConfirmSubmit(true)}>Submit for review</button>
            </div>
          )}
        </Card>
      )}

      {signOpen && (
        <SignModal
          defaultName={me!.displayName}
          onClose={() => setSignOpen(false)}
          onSign={(name) => signMut.mutate(name)}
          pending={signMut.isPending}
        />
      )}
    </div>
  );
}

function SectionCard({
  section, locked, ratings, texts, goals, onRate, onText, onGoals,
}: {
  section: Section;
  locked: boolean;
  ratings: Record<string, number>;
  texts: Record<string, string>;
  goals: Goal[];
  onRate: (fieldId: string, v: number) => void;
  onText: (fieldId: string, v: string) => void;
  onGoals: (g: Goal[]) => void;
}) {
  const weightBadge = <span className="tag">Weight {section.weight}%</span>;

  if (section.type === 'rating') {
    return (
      <Card title={section.title} actions={weightBadge}>
        <div className="stack" style={{ gap: 12 }}>
          {section.fields.map((f) => (
            <div key={f.id} className="spread" style={{ gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500 }}>{f.label}</span>
              <Rating value={ratings[f.id]} disabled={locked} onChange={(v) => onRate(f.id, v)} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (section.type === 'goal') {
    return (
      <Card title={section.title} actions={weightBadge}>
        <div className="stack" style={{ gap: 10 }}>
          {goals.length === 0 && <p className="muted" style={{ margin: 0 }}>No objectives yet.</p>}
          {goals.map((g, i) => (
            <div key={i} className="card" style={{ boxShadow: 'none' }}>
              <div className="card-pad stack" style={{ gap: 8 }}>
                <input type="text" placeholder="Objective" value={g.objective} disabled={locked}
                  onChange={(e) => onGoals(goals.map((x, j) => (j === i ? { ...x, objective: e.target.value } : x)))} />
                <input type="text" placeholder="Key result / metric" value={g.keyResult} disabled={locked}
                  onChange={(e) => onGoals(goals.map((x, j) => (j === i ? { ...x, keyResult: e.target.value } : x)))} />
                <div className="spread">
                  <select value={g.status} disabled={locked} style={{ maxWidth: 200 }}
                    onChange={(e) => onGoals(goals.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))}>
                    <option>On track</option>
                    <option>At risk</option>
                    <option>Achieved</option>
                    <option>Missed</option>
                  </select>
                  {!locked && <button className="btn btn-ghost" onClick={() => onGoals(goals.filter((_, j) => j !== i))}>Remove</button>}
                </div>
              </div>
            </div>
          ))}
          {!locked && (
            <button className="btn" onClick={() => onGoals([...goals, { objective: '', keyResult: '', status: 'On track' }])}>+ Add objective</button>
          )}
        </div>
      </Card>
    );
  }

  // text (and any other type) → textarea per field
  return (
    <Card title={section.title} actions={section.weight > 0 ? weightBadge : undefined}>
      <div className="stack" style={{ gap: 12 }}>
        {section.fields.map((f) => (
          <div key={f.id} className="field">
            <label>{f.label}</label>
            <textarea value={texts[f.id] ?? ''} disabled={locked} onChange={(e) => onText(f.id, e.target.value)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* Two-step electronic signature modal (§7). Credential step is a mock re-auth — no password is stored. */
export function SignModal({ defaultName, onClose, onSign, pending }: {
  defaultName: string;
  onClose: () => void;
  onSign: (name: string) => void;
  pending: boolean;
}) {
  const { authMode, stepUpReauth } = useAuth();
  const parts = defaultName.trim().split(/\s+/);
  const [first, setFirst] = useState(parts[0] ?? '');
  const [last, setLast] = useState(parts.slice(1).join(' '));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stepTwo, setStepTwo] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullName = useMemo(() => `${first} ${last}`.trim(), [first, last]);

  const doSign = async () => {
    setError(null);
    try {
      setReauthing(true);
      await stepUpReauth(); // real Entra step-up in prod; no-op in dev-mock
      onSign(fullName);
    } catch {
      setError('Re-authentication was cancelled or failed. You must verify your identity to sign.');
    } finally {
      setReauthing(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><div className="card-title">{stepTwo ? 'Confirm identity' : 'Electronic signature'}</div></div>
        <div className="card-pad stack" style={{ gap: 14 }}>
          {!stepTwo ? (
            <>
              <div className="form-grid">
                <div className="field"><label>First name</label><input type="text" value={first} onChange={(e) => setFirst(e.target.value)} /></div>
                <div className="field"><label>Last name</label><input type="text" value={last} onChange={(e) => setLast(e.target.value)} /></div>
              </div>
              <div className="field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-primary" disabled={!fullName} onClick={() => setStepTwo(true)}>Continue</button>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="notice">
                {authMode === 'entra'
                  ? 'Re-authenticate with Microsoft Entra ID to sign. Microsoft will prompt for your credentials — no password is stored here.'
                  : 'Dev-mock mode: signing is confirmed without a live Entra step-up. In production this requires Microsoft re-authentication.'}
              </div>
              <div className="sig-name">{fullName}</div>
              {error && <div className="notice notice-warn">{error}</div>}
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-primary" disabled={pending || reauthing} onClick={doSign}>
                  <span style={{ fontWeight: 800 }}>⊞</span> {reauthing ? 'Verifying…' : 'Sign with Microsoft'}
                </button>
                <button className="btn btn-ghost" onClick={() => setStepTwo(false)}>Back</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
