import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, EmptyState } from '../components/ui';

interface GdprOverview {
  retention: { item: string; period: string }[];
  processing: { activity: string; basis: string }[];
  consent: { item: string; state: string }[];
}

interface Subject {
  id: string;
  displayName: string;
  email: string;
  department?: string | null;
}

interface EraseResult { ok: boolean; anonymizedId: string; article: string }

export function Gdpr() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [receipt, setReceipt] = useState<unknown>(null);
  const [rectifyNote, setRectifyNote] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [eraseResult, setEraseResult] = useState<EraseResult | null>(null);

  const { data: overview } = useQuery({
    queryKey: ['gdpr', 'overview'],
    queryFn: () => api.get<GdprOverview>('/gdpr/overview'),
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ['gdpr', 'subjects'],
    queryFn: () => api.get<Subject[]>('/gdpr/subjects'),
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const exportMut = useMutation({
    mutationFn: () => api.post<unknown>('/gdpr/export', { userId: subjectId }),
    onSuccess: (r) => {
      setReceipt(r);
      setEraseResult(null);
      setRectifyNote(false);
      setToast('Data export prepared (Art. 15/20).');
    },
  });

  const eraseMut = useMutation({
    mutationFn: () => api.post<EraseResult>('/gdpr/erase', { userId: subjectId }),
    onSuccess: (r) => {
      setEraseResult(r);
      setReceipt(null);
      setConfirmErase(false);
      qc.invalidateQueries({ queryKey: ['gdpr', 'subjects'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setToast('Subject erased & anonymized (Art. 17).');
    },
  });

  const pending = exportMut.isPending || eraseMut.isPending;

  return (
    <div className="stack">
      {toast && <div className="toast">{toast}</div>}

      {/* DSAR */}
      <Card title="Data subject access requests (DSAR)">
        <p className="muted" style={{ marginTop: 0 }}>
          Respond to access, portability, rectification and erasure requests within 30 days.
        </p>
        <div className="field" style={{ maxWidth: 420 }}>
          <label>Data subject</label>
          <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setReceipt(null); setEraseResult(null); setRectifyNote(false); }}>
            <option value="">Select an employee…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName} — {s.email}{s.department ? ` · ${s.department}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            disabled={!subjectId || pending}
            onClick={() => exportMut.mutate()}
          >
            Export data (Art. 15/20)
          </button>
          <button
            className="btn"
            disabled={!subjectId}
            onClick={() => { setRectifyNote(true); setReceipt(null); setEraseResult(null); }}
          >
            Rectify
          </button>
          {confirmErase ? (
            <>
              <span>Erase &amp; anonymize this subject? This cannot be undone.</span>
              <button className="btn btn-danger" disabled={pending} onClick={() => eraseMut.mutate()}>Confirm erase</button>
              <button className="btn btn-ghost" onClick={() => setConfirmErase(false)}>Cancel</button>
            </>
          ) : (
            <button
              className="btn btn-danger"
              disabled={!subjectId}
              onClick={() => { setConfirmErase(true); setReceipt(null); setEraseResult(null); setRectifyNote(false); }}
            >
              Erase &amp; anonymize (Art. 17)
            </button>
          )}
        </div>

        {rectifyNote && (
          <div className="notice" style={{ marginTop: 14 }}>
            Rectification is handled at source — user attributes sync from Microsoft Entra ID / HR. Update the
            record in the directory of record; changes propagate on the next import.
          </div>
        )}

        {receipt != null && (
          <div className="notice" style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Export receipt (Art. 15/20)</div>
            <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 'var(--t-xs)' }}>
              {JSON.stringify(receipt, null, 2)}
            </pre>
          </div>
        )}

        {eraseResult && (
          <div className="notice" style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600 }}>Erasure complete ({eraseResult.article})</div>
            <div className="muted" style={{ fontSize: 'var(--t-sm)' }}>
              Subject anonymized as <span className="mono">{eraseResult.anonymizedId}</span>. An audit entry was written.
            </div>
          </div>
        )}
      </Card>

      {/* Retention schedule */}
      <Card title="Retention schedule" pad={false}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Data item</th><th>Retention period</th></tr>
            </thead>
            <tbody>
              {(overview?.retention ?? []).length === 0 ? (
                <tr><td colSpan={2} className="muted">No retention schedule defined.</td></tr>
              ) : (
                overview!.retention.map((r) => (
                  <tr key={r.item}><td style={{ fontWeight: 600 }}>{r.item}</td><td>{r.period}</td></tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Processing & lawful basis */}
      <Card title="Processing & lawful basis" pad={false}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Processing activity</th><th>Lawful basis</th></tr>
            </thead>
            <tbody>
              {(overview?.processing ?? []).length === 0 ? (
                <tr><td colSpan={2} className="muted">No processing activities recorded.</td></tr>
              ) : (
                overview!.processing.map((p) => (
                  <tr key={p.activity}><td style={{ fontWeight: 600 }}>{p.activity}</td><td>{p.basis}</td></tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Consent & transparency */}
      <Card title="Consent & transparency">
        {(overview?.consent ?? []).length === 0 ? (
          <EmptyState title="No consent records" icon="◔" />
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {overview!.consent.map((c) => (
              <div key={c.item} className="spread" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
                <span style={{ fontWeight: 500 }}>{c.item}</span>
                <span className="chip st-compliant">{c.state}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
