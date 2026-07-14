import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { Card } from '../components/ui';
import { Template } from '../lib/types';

type SectionType = 'rating' | 'text' | 'goal' | 'number';

interface EditField { key: string; label: string }
interface EditSection { key: string; title: string; type: SectionType; weight: number; fields: EditField[] }

const TYPE_OPTIONS: { value: SectionType; label: string }[] = [
  { value: 'rating', label: 'Rating 1–5' },
  { value: 'text', label: 'Long answer' },
  { value: 'goal', label: 'Goals·OKRs' },
  { value: 'number', label: 'Numeric' },
];

const SCOPES = ['IT', 'Finance', 'Finance Trade', 'Legal'];

let uidSeq = 0;
const uid = () => `k${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

export function TemplateBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: loaded, isLoading, error: loadError } = useQuery({
    queryKey: ['template', id],
    queryFn: () => api.get<Template>(`/templates/${id}`),
    enabled: !!id,
  });

  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [sections, setSections] = useState<EditSection[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // A system template opens as a customizable copy (POST). Custom templates are edited in place (PUT).
  const isCopy = !!loaded?.system;

  useEffect(() => {
    if (!loaded) return;
    setName(loaded.system ? `${loaded.name} (custom)` : loaded.name);
    setScope(loaded.scope ?? '');
    setSections(
      [...loaded.sections]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          key: uid(),
          title: s.title,
          type: (['rating', 'text', 'goal', 'number'].includes(s.type) ? s.type : 'rating') as SectionType,
          weight: s.weight,
          fields: [...s.fields].sort((a, b) => a.order - b.order).map((f) => ({ key: uid(), label: f.label })),
        })),
    );
  }, [loaded]);

  const totalWeight = sections.reduce((n, s) => n + (Number(s.weight) || 0), 0);
  const fieldCount = sections.reduce((n, s) => n + s.fields.length, 0);

  function patchSection(key: string, patch: Partial<EditSection>) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }
  function moveSection(idx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function removeSection(key: string) {
    setSections((prev) => prev.filter((s) => s.key !== key));
  }
  function addSection() {
    setSections((prev) => [...prev, { key: uid(), title: '', type: 'rating', weight: 0, fields: [] }]);
  }
  function addField(sectionKey: string) {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, fields: [...s.fields, { key: uid(), label: '' }] } : s)));
  }
  function patchField(sectionKey: string, fieldKey: string, label: string) {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, fields: s.fields.map((f) => (f.key === fieldKey ? { ...f, label } : f)) } : s)));
  }
  function removeField(sectionKey: string, fieldKey: string) {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, fields: s.fields.filter((f) => f.key !== fieldKey) } : s)));
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        scope: scope.trim(),
        sections: sections.map((s) => ({
          title: s.title,
          type: s.type,
          weight: Number(s.weight) || 0,
          fields: s.fields.map((f) => ({ label: f.label })),
        })),
      };
      if (id && loaded && !loaded.system) return api.put<Template>(`/templates/${id}`, body);
      return api.post<Template>('/templates', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      navigate('/templates');
    },
  });

  function onSave() {
    setValidationError(null);
    if (!name.trim()) {
      setValidationError('Template name is required.');
      return;
    }
    if (totalWeight !== 100) {
      setValidationError(`Section weights must total exactly 100% — currently ${totalWeight}%.`);
      return;
    }
    save.mutate();
  }

  const apiErrorMsg = save.error instanceof ApiError ? save.error.message : save.error ? String(save.error) : null;

  const scopeOptions = scope && !SCOPES.includes(scope) ? [...SCOPES, scope] : SCOPES;

  if (id && isLoading) return <p className="muted">Loading…</p>;
  if (id && loadError) return <p className="muted">Could not load template: {loadError instanceof ApiError ? loadError.message : 'error'}.</p>;

  return (
    <div className="stack">
      <div>
        <Link to="/templates" className="muted">← All templates</Link>
      </div>

      {isCopy && (
        <div className="notice">
          You are customizing a copy of a system template. Saving creates a new reusable custom template.
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 320px', alignItems: 'start' }}>
        <div className="stack">
          <Card title="Template details">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="tpl-name">Name</label>
                <input id="tpl-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IT Appraisal" />
              </div>
              <div className="field">
                <label htmlFor="tpl-scope">Function / scope</label>
                <select id="tpl-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="">Select scope…</option>
                  {scopeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Total weight</label>
                <input type="text" value={`${totalWeight}%`} readOnly style={{ color: totalWeight !== 100 ? 'var(--red)' : undefined }} />
              </div>
            </div>
          </Card>

          {sections.map((s, idx) => (
            <Card key={s.key} pad={false}>
              <div className="card-pad stack" style={{ gap: 12 }}>
                <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <div className="stack" style={{ gap: 2 }}>
                    <button className="btn btn-ghost" type="button" onClick={() => moveSection(idx, -1)} disabled={idx === 0} title="Move up" style={{ padding: '2px 8px' }}>▲</button>
                    <button className="btn btn-ghost" type="button" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1} title="Move down" style={{ padding: '2px 8px' }}>▼</button>
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Section title</label>
                    <input type="text" value={s.title} onChange={(e) => patchSection(s.key, { title: e.target.value })} placeholder="Section title" />
                  </div>
                  <div className="field" style={{ width: 150 }}>
                    <label>Type</label>
                    <select value={s.type} onChange={(e) => patchSection(s.key, { type: e.target.value as SectionType })}>
                      {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ width: 90 }}>
                    <label>Weight %</label>
                    <input type="number" min={0} max={100} value={s.weight} onChange={(e) => patchSection(s.key, { weight: e.target.value === '' ? 0 : Number(e.target.value) })} />
                  </div>
                  <button className="btn btn-danger" type="button" onClick={() => removeSection(s.key)} title="Remove section" style={{ marginTop: 22 }}>🗑</button>
                </div>

                <div className="stack" style={{ gap: 6 }}>
                  {s.fields.map((f) => (
                    <div key={f.key} className="row" style={{ gap: 8 }}>
                      <input type="text" style={{ flex: 1 }} value={f.label} onChange={(e) => patchField(s.key, f.key, e.target.value)} placeholder="Field label" />
                      <button className="btn btn-ghost" type="button" onClick={() => removeField(s.key, f.key)} title="Remove field">✕</button>
                    </div>
                  ))}
                  <div>
                    <button className="btn btn-ghost" type="button" onClick={() => addField(s.key)}>+ Add field</button>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          <div>
            <button className="btn btn-primary" type="button" onClick={addSection}>+ Add section</button>
          </div>
        </div>

        <div style={{ position: 'sticky', top: 20 }}>
          <Card title="Summary" pad={false}>
            <div className="card-pad stack" style={{ gap: 12 }}>
              <div className="spread"><span className="muted">Sections</span><span className="mono">{sections.length}</span></div>
              <div className="spread"><span className="muted">Fields</span><span className="mono">{fieldCount}</span></div>
              <div className="spread">
                <span className="muted">Total weight</span>
                <span className="mono" style={{ color: totalWeight !== 100 ? 'var(--red)' : undefined }}>{totalWeight}%</span>
              </div>

              {validationError && <div className="notice notice-warn">{validationError}</div>}
              {apiErrorMsg && <div className="notice notice-warn">{apiErrorMsg}</div>}

              <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: 0 }}>
                Saved templates become reusable across cycles and teams.
              </p>

              <button className="btn btn-primary" type="button" onClick={onSave} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save template'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => navigate('/templates')}>Cancel</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
