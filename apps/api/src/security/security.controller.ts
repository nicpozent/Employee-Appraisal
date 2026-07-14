import { Controller, Get } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../auth/roles.decorator';

/* Security & compliance (§5.12 / §9). Content is product spec, not user data. */
@Controller('security')
@Roles('admin', 'cio')
export class SecurityController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async security() {
    const chain = await this.audit.verifyChain();
    return {
      summary: {
        controlsImplemented: CONTROLS.filter((c) => c.status === 'Met').length,
        controlsTotal: CONTROLS.length,
        iso27001: 'Aligned',
        nis2: 'Ready',
        auditChain: chain,
      },
      controls: CONTROLS,
      architecture: ARCHITECTURE,
    };
  }
}

const CONTROLS = [
  { framework: 'ISO 27001', code: 'A.9.2', control: 'Access provisioning', how: 'RBAC via Entra app roles, JML synced from HR', status: 'Met' },
  { framework: 'ISO 27001', code: 'A.12.4', control: 'Logging & monitoring', how: 'Immutable append-only audit log, 24-month retention', status: 'Met' },
  { framework: 'NIST CSF', code: 'PR.AC-7', control: 'Authentication', how: 'MFA via Conditional Access, SSO, no local credentials', status: 'Met' },
  { framework: 'NIST CSF', code: 'DE.CM-1', control: 'Continuous monitoring', how: 'Sign-in risk + anomalous-access alerts (Entra ID Protection)', status: 'Partial' },
  { framework: 'NIS2', code: 'Art.21', control: 'Risk management measures', how: 'Risk register, encryption, MFA, incident handling', status: 'Met' },
  { framework: 'GDPR', code: 'Art.5/17', control: 'Data minimization & erasure', how: 'Retention auto-purge, DSAR export & anonymization', status: 'Met' },
  { framework: 'GDPR', code: 'Art.32', control: 'Security of processing', how: 'AES-256 at rest, TLS 1.3, RBAC, audit logging', status: 'Met' },
  { framework: 'STRIDE', code: 'Tampering', control: 'Integrity of appraisals', how: 'Submitted appraisals locked; changes require explicit request; all logged', status: 'Met' },
  { framework: 'STRIDE', code: 'Repudiation', control: 'Non-repudiation', how: 'Every decision & signature attributed to an authenticated identity + timestamp + IP', status: 'Met' },
  { framework: 'MITRE ATT&CK', code: 'T1078', control: 'Valid-accounts abuse', how: 'Conditional Access, MFA, least-privilege app roles', status: 'Monitored' },
];

const ARCHITECTURE = [
  { area: 'Authentication', detail: 'Entra ID SSO + MFA (Conditional Access)' },
  { area: 'Authorization', detail: 'App roles & RBAC, least privilege, server-side checks' },
  { area: 'Data at rest', detail: 'AES-256, EU region, managed key vault' },
  { area: 'Data in transit', detail: 'TLS 1.3, HSTS' },
  { area: 'Auditability', detail: 'Append-only hash-chained log, 24-month retention' },
  { area: 'Notifications', detail: 'MS Graph mail, scoped Mail.Send' },
];
