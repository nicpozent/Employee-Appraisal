import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DevUser } from '../lib/types';

export function SignIn() {
  const { authMode, signInMock, signInEntra } = useAuth();
  const [busy, setBusy] = useState(false);
  const { data: devUsers } = useQuery({
    queryKey: ['dev-users'],
    queryFn: () => api.get<DevUser[]>('/auth/dev-users'),
    enabled: authMode === 'mock',
  });

  return (
    <div className="signin">
      <div className="left">
        <div className="plate"><img src="/lockup.png" alt="Biltema · Birgma" style={{ height: 44 }} /></div>
        <h1>One appraisal platform for the whole group.</h1>
        <p>Self-assessments, mirrored manager reviews, calibrated scoring and dual electronic sign-off — for Biltema and Birgma, secured by Microsoft Entra ID.</p>
        <div className="trust">
          <span className="t">Entra ID SSO</span>
          <span className="t">ISO 27001 controls</span>
          <span className="t">GDPR &amp; NIS2 ready</span>
        </div>
      </div>

      <div className="right">
        <div>
          <div className="eyebrow" style={{ color: 'var(--muted)', fontSize: 'var(--t-2xs)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Welcome</div>
          <h2 style={{ fontSize: 24, margin: '4px 0 6px' }}>Sign in to continue</h2>
          <p className="muted" style={{ margin: 0 }}>Access is governed by your Microsoft Entra ID account and assigned app roles.</p>
        </div>

        <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '12px 18px' }} disabled={busy}
          onClick={async () => { setBusy(true); try { await signInEntra(); } finally { setBusy(false); } }}>
          <span style={{ fontWeight: 800 }}>⊞</span> Sign in with Microsoft
        </button>

        {authMode === 'mock' && (
          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-head"><div className="card-title">Developer sign-in</div></div>
            <div className="card-pad stack" style={{ gap: 8 }}>
              <p className="muted" style={{ marginTop: 0 }}>No live tenant configured — pick an identity to preview each role. (Disabled automatically once Entra is connected.)</p>
              {(devUsers ?? []).map((u) => (
                <button key={u.upn} className="btn" style={{ justifyContent: 'space-between' }} disabled={busy}
                  onClick={async () => { setBusy(true); try { await signInMock(u.upn); } finally { setBusy(false); } }}>
                  <span>{u.displayName}</span>
                  <span className="tag">{u.roles.join(', ')}</span>
                </button>
              ))}
              {devUsers && devUsers.length === 0 && <p className="muted">No users seeded. Run the seed with SEED_DEV_ORG=true.</p>}
            </div>
          </div>
        )}

        <p className="muted" style={{ fontSize: 'var(--t-xs)', lineHeight: 1.6 }}>
          Registered as an Enterprise Application in Entra ID. Roles are assigned via app roles; MFA is enforced through Conditional Access.
        </p>
      </div>
    </div>
  );
}
