import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, EmptyState, fmtDate } from '../components/ui';

interface DirectoryUser {
  id: string;
  displayName: string;
  email: string;
  upn: string;
  department?: string | null;
  org?: string | null;
  managerName?: string | null;
  appRoles: string[];
  roles: string[];
  entraGroups: string[];
  mfaEnabled: boolean;
  lastSignIn?: string | null;
  entraObjectId?: string | null;
}

interface ImportConfig {
  live: boolean;
  authMode: string;
  tenantId: string | null;
  clientId: string | null;
  configuredGroupIds: string[];
  defaultGroupRoleMap: Record<string, string>;
  graphScopes: string[];
}

interface ImportResult {
  live: boolean;
  groups: { groupId: string; groupName: string; role: string; imported: number }[];
  created: number;
  updated: number;
  total: number;
}

/* App roles reference table (§3) — hardcoded product spec, mapped from Entra ID. */
const APP_ROLES: { label: string; appRole: string; group: string }[] = [
  { label: 'Employee (Appraisee)', appRole: 'Appraisal.Employee', group: 'SG-Appraisal-Employees' },
  { label: 'Manager', appRole: 'Appraisal.Manager.IT', group: 'SG-IT-Managers' },
  { label: 'CTO', appRole: 'Appraisal.Exec.CTO', group: 'SG-Exec-IT' },
  { label: 'CIO', appRole: 'Appraisal.Exec.CIO', group: 'SG-Exec-IT' },
  { label: 'CFO', appRole: 'Appraisal.Exec.CFO', group: 'SG-Exec-Finance' },
  { label: 'Managing Director', appRole: 'Appraisal.Exec.MD', group: 'SG-Exec' },
  { label: 'Platform Administrator', appRole: 'Appraisal.Admin', group: 'SG-App-Admins' },
];

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?';
}

export function Users() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [groupIdsInput, setGroupIdsInput] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<DirectoryUser[]>('/users'),
  });
  const { data: config } = useQuery({
    queryKey: ['users', 'import', 'config'],
    queryFn: () => api.get<ImportConfig>('/users/import/config'),
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const importMut = useMutation({
    mutationFn: () => {
      const groupIds = groupIdsInput.split(',').map((s) => s.trim()).filter(Boolean);
      return api.post<ImportResult>('/users/import', groupIds.length ? { groupIds } : {});
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['users'] });
      setToast(`Import complete — ${r.created} created, ${r.updated} updated.`);
    },
  });

  const signOnUrl = window.location.origin;

  return (
    <div className="stack">
      {toast && <div className="toast">{toast}</div>}

      {/* Enterprise Application — Entra ID */}
      <Card title="Enterprise Application — Entra ID">
        <div className="form-grid">
          <div className="field">
            <label>Application (client) ID</label>
            <div className="mono">{config?.clientId ?? '— configure in Azure'}</div>
          </div>
          <div className="field">
            <label>Directory (tenant) ID</label>
            <div className="mono">{config?.tenantId ?? '— configure in Azure'}</div>
          </div>
          <div className="field">
            <label>Sign-on URL</label>
            <div className="mono">{signOnUrl}</div>
          </div>
          <div className="field">
            <label>Token / SSO</label>
            <div>OIDC + SAML · MFA via Conditional Access</div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Granted Microsoft Graph scopes</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {(config?.graphScopes ?? []).length === 0 ? (
              <span className="muted">— configure in Azure</span>
            ) : (
              config!.graphScopes.map((s) => <span key={s} className="tag mono">{s}</span>)
            )}
          </div>
        </div>
      </Card>

      {/* Entra import panel */}
      <Card
        title="Import users from Entra groups"
        actions={
          config?.live ? (
            <span className="chip st-compliant">Connected to Graph</span>
          ) : (
            <span className="chip st-enriching">Dev-mock (simulated import)</span>
          )
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          Synchronize the user directory from Microsoft Entra security groups. App roles are derived from
          group membership using the default map below.
        </p>

        <div className="field">
          <label>Group object IDs (comma-separated — leave blank to use configured groups)</label>
          <textarea
            value={groupIdsInput}
            placeholder={
              (config?.configuredGroupIds ?? []).length
                ? config!.configuredGroupIds.join(', ')
                : 'e.g. 3f2a…, 9c81…'
            }
            onChange={(e) => setGroupIdsInput(e.target.value)}
          />
          {(config?.configuredGroupIds ?? []).length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <span className="muted" style={{ fontSize: 'var(--t-xs)' }}>Configured:</span>
              {config!.configuredGroupIds.map((g) => <span key={g} className="tag mono">{g}</span>)}
            </div>
          )}
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Default group → role map</label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Entra group</th><th>App role</th></tr>
              </thead>
              <tbody>
                {Object.entries(config?.defaultGroupRoleMap ?? {}).length === 0 ? (
                  <tr><td colSpan={2} className="muted">No mappings configured.</td></tr>
                ) : (
                  Object.entries(config!.defaultGroupRoleMap).map(([g, role]) => (
                    <tr key={g}><td className="mono">{g}</td><td><span className="tag">{role}</span></td></tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <button className="btn btn-primary" disabled={importMut.isPending} onClick={() => importMut.mutate()}>
            {importMut.isPending ? 'Importing…' : 'Run import'}
          </button>
        </div>

        {result && (
          <div className="notice" style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Import summary — {result.created} created · {result.updated} updated · {result.total} total
              {result.live ? '' : ' (simulated)'}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Group</th><th>Role</th><th>Imported</th></tr>
                </thead>
                <tbody>
                  {result.groups.map((g) => (
                    <tr key={g.groupId}>
                      <td>{g.groupName}</td>
                      <td><span className="tag">{g.role}</span></td>
                      <td className="mono">{g.imported}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* App roles — mapped from Entra ID */}
      <Card title="App roles — mapped from Entra ID">
        <div className="notice" style={{ marginBottom: 14 }}>
          Access is determined entirely by the Entra ID app-role assignment. Removing the assignment (or the
          user's security-group membership) revokes access immediately. Roles are not managed in-app.
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Role</th><th>Entra appRole value</th><th>Security group</th></tr>
            </thead>
            <tbody>
              {APP_ROLES.map((r) => (
                <tr key={r.appRole}>
                  <td style={{ fontWeight: 600 }}>{r.label}</td>
                  <td className="mono">{r.appRole}</td>
                  <td className="mono">{r.group}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* User directory */}
      <Card title="User directory" pad={false}>
        {isLoading ? (
          <div className="card-pad"><p className="muted">Loading…</p></div>
        ) : users.length === 0 ? (
          <div className="card-pad">
            <EmptyState title="No users yet" icon="◔">No users yet — run an import to sync from Entra.</EmptyState>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Department</th>
                  <th>App role</th>
                  <th>Entra group</th>
                  <th>MFA</th>
                  <th>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <span
                          aria-hidden
                          style={{
                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                            display: 'grid', placeItems: 'center',
                            background: 'var(--accent-050)', color: 'var(--accent)',
                            fontSize: 'var(--t-xs)', fontWeight: 700,
                          }}
                        >
                          {initials(u.displayName)}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.displayName}</div>
                          <div className="muted" style={{ fontSize: 'var(--t-xs)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{u.department ?? '—'}</td>
                    <td>{u.roles.length ? u.roles.join(', ') : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {u.entraGroups.length ? u.entraGroups.map((g) => <span key={g} className="tag">{g}</span>) : '—'}
                      </div>
                    </td>
                    <td>{u.mfaEnabled ? '✓' : '—'}</td>
                    <td className="mono">{fmtDate(u.lastSignIn)}</td>
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
