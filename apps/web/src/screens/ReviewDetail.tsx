import { useEffect, useMemo, useState, ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Appraisal, Section, Signature } from '../lib/types';
import { Card, StatusChip, Rating, fmtDate } from '../components/ui';
import { SignModal } from './MyAppraisal';

const STEPPER = ['Manager review', 'Decision', 'Sign-off'];

function stageOf(a: Appraisal): number {
  if (a.status === 'approved' || a.signed) return 2;
  if (a.status === 'submitted' && a.managerReviewDone) return 1;
  return 0; // review
}

export function ReviewDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');

  const [mRatings, setMRatings] = useState<Record<string, number>>({});
  const [mComments, setMComments] = useState<Record<string, string>>({});
  const [finalEmp, setFinalEmp] = useState('');
  const [finalMgr, setFinalMgr] = useState('');

  const { data: appraisal, isLoading } = useQuery({
    queryKey: ['appraisal', id],
    queryFn: () => api.get<Appraisal>(`/appraisals/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!appraisal) return;
    setMRatings({ ...(appraisal.managerReview?.ratings ?? {}) });
    setMComments({ ...(appraisal.managerReview?.sectionComments ?? {}) });
    setFinalEmp(appraisal.finalCommentEmployee ?? '');
    setFinalMgr(appraisal.finalCommentManager ?? '');
  }, [appraisal]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['appraisals'] });
    qc.invalidateQueries({ queryKey: ['appraisal', id] });
  };

  const reviewMut = useMutation({
    mutationFn: () => api.post<Appraisal>(`/appraisals/${id}/manager-review`, { ratings: mRatings, sectionComments: mComments }),
    onSuccess: () => { invalidate(); setToast('Manager review submitted.'); },
  });
  const decisionMut = useMutation({
    mutationFn: (action: 'approve' | 'request' | 'reject') => api.post<Appraisal>(`/appraisals/${id}/decision`, { action, comment: decisionComment || undefined }),
    onSuccess: () => { invalidate(); setDecisionComment(''); setToast('Decision recorded.'); },
  });
  const signMut = useMutation({
    mutationFn: (name: string) => api.post<Appraisal>(`/appraisals/${id}/sign`, { party: 'manager', name }),
    onSuccess: () => { invalidate(); setSignOpen(false); setToast('Signed.'); },
  });
  const finalMut = useMutation({
    mutationFn: (body: { employee?: string; manager?: string }) => api.post<Appraisal>(`/appraisals/${id}/final-comments`, body),
    onSuccess: () => { invalidate(); setToast('Final comment saved.'); },
  });

  const sections = useMemo<Section[]>(
    () => [...(appraisal?.template?.sections ?? [])].sort((a, b) => a.order - b.order),
    [appraisal],
  );
  const ratingSections = sections.filter((s) => s.type === 'rating');
  const allRatingFields = ratingSections.flatMap((s) => s.fields);
  const allRated = allRatingFields.length > 0 && allRatingFields.every((f) => !!mRatings[f.id]);

  if (isLoading) return <p className="muted">Loading…</p>;
  if (!appraisal) return <p className="muted">Appraisal not found.</p>;

  const isManager = appraisal.managerId === me!.id;
  const isEmployee = appraisal.employeeId === me!.id;
  const stage = stageOf(appraisal);
  const reviewStage = stage === 0;
  const decisionStage = stage === 1;
  const signStage = stage === 2 && !appraisal.signed;
  const reviewEditable = isManager && reviewStage;

  const emp = appraisal.employee;
  const empSelf = appraisal.employeeSelf ?? {};
  const textSections = sections.filter((s) => s.type === 'text');
  const sigs = appraisal.signatures ?? [];
  const empSig = sigs.find((s) => s.party === 'employee');
  const mgrSig = sigs.find((s) => s.party === 'manager');

  return (
    <div className="stack">
      {toast && <div className="toast">{toast}</div>}

      <Link to="/reviews" className="muted" style={{ fontSize: 'var(--t-sm)' }}>← All reviews</Link>

      {/* Header */}
      <Card>
        <div className="spread" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="row" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 22 }}>{emp?.displayName ?? 'Employee'}</h2>
              <StatusChip status={appraisal.status} signed={appraisal.signed} />
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 'var(--t-sm)' }}>
              {emp?.department ?? '—'} · {appraisal.template?.name ?? '—'} · Submitted {fmtDate(appraisal.submittedAt)} · Due {fmtDate(appraisal.cycle?.targetDate)}
            </div>
          </div>
          <div className="row" style={{ gap: 28 }}>
            <div>
              <div className="muted" style={{ fontSize: 'var(--t-2xs)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Employee</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{appraisal.employeeScore ?? 0}/100</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 'var(--t-2xs)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Manager</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--accent)' }}>{appraisal.managerScore ?? 0}/100</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stepper */}
      <div className="steps">
        {STEPPER.map((label, i) => (
          <div key={label} className={`step-tile${i === stage ? ' on' : ''}`}>
            <div className="st-lbl">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {/* Left column */}
        <div className="stack">
          <Card title="Employee self-assessment">
            {textSections.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No written self-assessment.</p>
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                {textSections.flatMap((s) => s.fields).map((f) => (
                  <div key={f.id}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{f.label}</div>
                    <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{empSelf.texts?.[f.id] || '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {ratingSections.map((section) => (
            <Card key={section.id} title={section.title} actions={<span className="tag">Weight {section.weight}%</span>}>
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table>
                  <thead><tr><th>Competency</th><th>Self</th><th>Manager rating</th></tr></thead>
                  <tbody>
                    {section.fields.map((f) => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 500 }}>{f.label}</td>
                        <td className="mono muted">{empSelf.ratings?.[f.id] ?? '—'}</td>
                        <td>
                          <Rating
                            value={mRatings[f.id]}
                            disabled={!reviewEditable}
                            onChange={(v) => setMRatings((m) => ({ ...m, [f.id]: v }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="field">
                <label>Manager comment</label>
                <textarea
                  value={mComments[section.id] ?? ''}
                  disabled={!reviewEditable}
                  onChange={(e) => setMComments((m) => ({ ...m, [section.id]: e.target.value }))}
                />
              </div>
            </Card>
          ))}

          {stage === 2 && (
            <Card title="Final comments">
              <div className="form-grid">
                <div className="field">
                  <label>Final comment — Employee</label>
                  <textarea
                    value={finalEmp}
                    disabled={!(isEmployee && !appraisal.signed)}
                    onChange={(e) => setFinalEmp(e.target.value)}
                    placeholder={isEmployee ? 'Add your closing comment…' : '—'}
                  />
                  {isEmployee && !appraisal.signed && (
                    <button className="btn" style={{ marginTop: 8, alignSelf: 'flex-start' }} disabled={finalMut.isPending}
                      onClick={() => finalMut.mutate({ employee: finalEmp })}>Save my comment</button>
                  )}
                </div>
                <div className="field">
                  <label>Final comment — Manager</label>
                  <textarea
                    value={finalMgr}
                    disabled={!(isManager && !appraisal.signed)}
                    onChange={(e) => setFinalMgr(e.target.value)}
                    placeholder={isManager ? 'Add your closing comment…' : '—'}
                  />
                  {isManager && !appraisal.signed && (
                    <button className="btn" style={{ marginTop: 8, alignSelf: 'flex-start' }} disabled={finalMut.isPending}
                      onClick={() => finalMut.mutate({ manager: finalMgr })}>Save my comment</button>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right rail */}
        <div className="stack">
          {reviewStage && (
            <Card title="Manager review">
              {isManager ? (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>Rate every competency and add your comments. Your scores are stored alongside the employee's.</p>
                  {!allRated && <div className="notice notice-warn" style={{ marginBottom: 12 }}>Rate every competency to submit your review.</div>}
                  <button className="btn btn-primary" disabled={!allRated || reviewMut.isPending} onClick={() => reviewMut.mutate()}>Submit manager review</button>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Awaiting the manager's review.</p>
              )}
            </Card>
          )}

          {decisionStage && (
            <Card title="Decision">
              {isManager ? (
                <div className="stack" style={{ gap: 12 }}>
                  <div className="field">
                    <label>Comment (optional)</label>
                    <textarea value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} />
                  </div>
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" disabled={decisionMut.isPending} onClick={() => decisionMut.mutate('approve')}>Approve</button>
                    <button className="btn" disabled={decisionMut.isPending} onClick={() => decisionMut.mutate('request')}>Request modification</button>
                    <button className="btn btn-danger" disabled={decisionMut.isPending} onClick={() => decisionMut.mutate('reject')}>Reject</button>
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Awaiting the manager's decision.</p>
              )}
            </Card>
          )}

          {signStage && (
            <Card title="Electronic sign-off">
              <div className="stack" style={{ gap: 14 }}>
                <SignatureBlock label="Employee" sig={empSig} />
                <SignatureBlock
                  label="Manager"
                  sig={mgrSig}
                  action={isManager && !mgrSig ? <button className="btn btn-primary" onClick={() => setSignOpen(true)}>Sign</button> : undefined}
                />
              </div>
            </Card>
          )}

          <Card title="Approval & signature chain">
            <div className="stack" style={{ gap: 8 }}>
              <ChainRow done={!!appraisal.submittedAt || stage >= 0} label="Employee submitted" />
              <ChainRow done={appraisal.managerReviewDone} label="Manager review" />
              <ChainRow done={!!empSig} label="Employee sign-off" />
              <ChainRow done={!!mgrSig} label="Manager sign-off" />
            </div>
          </Card>
        </div>
      </div>

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

function SignatureBlock({ label, sig, action }: { label: string; sig?: Signature; action?: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
      <div className="muted" style={{ fontSize: 'var(--t-2xs)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{label}</div>
      {sig ? (
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span className="sig-name">{sig.name}</span>
          <span className="chip st-compliant">Signed</span>
          <span className="muted mono" style={{ fontSize: 'var(--t-xs)' }}>{fmtDate(sig.signedAt)} · {sig.account}</span>
        </div>
      ) : (
        <div className="spread">
          <span className="muted">Not signed yet</span>
          {action}
        </div>
      )}
    </div>
  );
}

function ChainRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <span style={{ color: done ? 'var(--ok)' : 'var(--muted)', fontWeight: 700 }}>{done ? '●' : '○'}</span>
      <span style={{ color: done ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
    </div>
  );
}
