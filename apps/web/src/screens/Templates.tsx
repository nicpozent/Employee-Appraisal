import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, EmptyState } from '../components/ui';
import { Template } from '../lib/types';

export function Templates() {
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<Template[]>('/templates'),
  });

  return (
    <div className="stack">
      <div className="spread">
        <p className="muted" style={{ maxWidth: 640, margin: 0 }}>
          Templates define the sections, competencies and weightings an appraisal is scored against. Start
          from a system template to customize a reusable copy, or build one from scratch. Saved templates
          become reusable across cycles and teams.
        </p>
        <Link to="/templates/new" className="btn btn-primary">Blank template</Link>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : templates.length === 0 ? (
        <Card>
          <EmptyState title="No templates yet" icon="◔">
            Create a blank template to define appraisal sections and weightings.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-3">
          {templates.map((t) => {
            const totalFields = t.sections.reduce((n, s) => n + s.fields.length, 0);
            return (
              <Link
                key={t.id}
                to={`/templates/${t.id}`}
                className="card"
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <div className="card-pad stack" style={{ gap: 12 }}>
                  <div className="spread">
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: t.color ?? 'var(--accent)',
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                    {t.system ? (
                      <span className="chip st-published">System</span>
                    ) : (
                      <span className="tag">Custom</span>
                    )}
                  </div>
                  <div>
                    <div className="card-title" style={{ marginBottom: 4 }}>{t.name}</div>
                    {t.desc && (
                      <div className="muted" style={{ fontSize: 'var(--t-sm)' }}>{t.desc}</div>
                    )}
                  </div>
                  <div className="muted mono" style={{ fontSize: 'var(--t-xs)' }}>
                    {t.sections.length} sections · {totalFields} fields
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
