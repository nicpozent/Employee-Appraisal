# Employee Appraisal Platform — Threat Model & Security Analysis

> STRIDE + LINDDUN assessment grounded in the running code. A styled, interactive
> version of this report lives at [`threat-model.html`](./threat-model.html).
>
> **Reviewed:** 2026-07-16 · **Stack:** React 18 · TS · NestJS · Prisma · PostgreSQL 16 ·
> Entra ID (OIDC/MSAL) · MS Graph · **e2e tests:** 19

## Summary

| Metric | Value |
|---|---|
| Security posture | **3.9 / 5** — core threats mitigated; hardening pending pre-prod |
| STRIDE threats | **22** — 15 mitigated · 6 partial · 1 open |
| Privacy (LINDDUN) | **6** — GDPR DSAR + retention wired; DPIA sign-off outstanding |
| Frameworks mapped | **6** — ISO 27001 · NIST CSF · NIS2 · GDPR · STRIDE · MITRE ATT&CK |

## System model & trust boundaries

Four principal trust boundaries — every arrow that crosses one is an attack surface
enumerated in the scorecard:

1. **Client · untrusted** — the browser SPA (React + MSAL) for Employee / Manager / Exec / Admin.
2. **Edge · TLS** — nginx serving the static SPA and reverse-proxying `/api` same-origin.
3. **Application zone** — the NestJS API, **where all authorization is decided**
   (`AuthGuard`, `RolesGuard`, `@NoAdmin`, `ScopeService`, `ValidationPipe`) + the reminder scheduler.
4. **Data zone · EU** — PostgreSQL 16 (appraisals, signatures, hash-chained audit log).

Microsoft **Entra ID** (OIDC · JWKS · MFA) and **MS Graph** (group import · sendMail) are
trusted external services.

```
Browser SPA ──HTTPS──► nginx ──/api──► NestJS API ──Prisma/TLS──► PostgreSQL
     │                                     │  └──import users · mail──► MS Graph
     └──OIDC login + MFA / step-up──► Entra ID ◄──validate JWT via JWKS──┘
```

**Assets:** appraisal answers/scores · electronic signatures · the audit chain · the user
directory · identity tokens · the Graph client secret.

## STRIDE threat scorecard

Severity is inherent risk *before* controls; status is what ships **today**.

| ID | Category | Threat | Severity | Mitigation (implemented) | Status |
|----|----------|--------|----------|--------------------------|--------|
| S1 | Spoofing | Forged / replayed identity token | High | Entra OIDC; JWT signature validated via JWKS (RS256) with audience + issuer checks; MFA via Conditional Access | Mitigated |
| S2 | Spoofing | Dev-mock header trusted as identity | **Critical** | `x-dev-upn` path active only when `AUTH_MODE≠entra`; prod must run Entra mode. Not yet hard-failed if mis-set | Partial |
| S3 | Spoofing | Signing as another party | High | Signer `party` must match caller (employee vs responsible manager); MSAL `prompt=login` step-up before signing | Mitigated |
| T1 | Tampering | Editing a submitted / locked appraisal | High | State machine: self-edit only in `not_started/in_progress/changes_requested`; `signed=true` locks | Mitigated |
| T2 | Tampering | Client-supplied score manipulation | Medium | Server recomputes weighted 0–100 score from ratings; client scores ignored | Mitigated |
| T3 | Tampering | Mass-assignment / over-posting | Medium | Global `ValidationPipe({whitelist:true})` strips unknown props; final-comments limits each party to its own field | Mitigated |
| T4 | Tampering | Audit-log alteration | Medium | Append-only writes, SHA-256 `prevHash` chain, `/audit/verify` integrity check. Detects — a DBA can still delete rows | Partial |
| R1 | Repudiation | Denying a decision or edit | Medium | Every mutation appends an audit event with actor, action, object ref, source IP, timestamp — chained | Mitigated |
| R2 | Repudiation | Denying a signature | High | E-sign records name, UPN, IP, server timestamp; `APPRAISAL.ESIGN` audited after step-up (advanced e-sign, not eIDAS QES) | Mitigated |
| I1 | Info disclosure | Admin reading appraisal content | **Critical** | Admin-blindness: `@NoAdmin` → 403 on appraisal & analytics; GDPR export receipt-only to admin. Covered by e2e test | Mitigated |
| I2 | Info disclosure | Cross-scope / IDOR access | High | Per-request `ScopeService` where-clause + `canView` on single fetch; role scopes server-side. Covered by e2e tests | Mitigated |
| I3 | Info disclosure | Interception in transit | Medium | TLS at edge; CORS locked to configured origin; same-origin API via nginx. HSTS/CSP headers not yet set | Partial |
| I4 | Info disclosure | Exposure at rest | Medium | Full-disk AES-256 + EU residency at deployment layer. No application field-level encryption yet | Partial |
| I5 | Info disclosure | Secret exposure | High | `.env` git-ignored; secrets via environment. Not yet in a managed secret store; DB uses a password | Partial |
| I6 | Info disclosure | Over-privileged Graph app | Medium | Least-privilege only: `User.Read.All · GroupMember.Read.All · Directory.Read.All · Mail.Send` | Mitigated |
| D1 | Denial of service | Request flooding / credential stuffing | Medium | All routes require auth, but **no application rate-limiting is implemented yet** | **Open** |
| D2 | Denial of service | Mail / reminder abuse | Low | Reminder sweep scheduled & bounded per run; Graph applies send throttling | Mitigated |
| D3 | Denial of service | Oversized payloads | Low | Validation + typed DTOs; relies on framework default body limits — explicit cap recommended | Partial |
| E1 | Elevation of privilege | Client-forged role | High | Roles derived only from the validated token `roles` claim; client-side role is cosmetic | Mitigated |
| E2 | Elevation of privilege | Reaching privileged endpoints | High | `@Roles(...)` + RolesGuard enforced per controller server-side; verified by e2e tests | Mitigated |
| E3 | Elevation of privilege | Manager acting outside team | Medium | `isManagerOf` checks `appraisal.managerId === caller` before review/decision/sign; verified by e2e test | Mitigated |
| E4 | Elevation of privilege | Escalation via group import | Medium | Import derives roles from a governed group→role map; effective access is the Entra assignment; changes audited | Mitigated |

## Privacy threats — LINDDUN / GDPR

Appraisal data is identified personal data about performance — a high-sensitivity category.

| ID | Privacy threat | Severity | Control | Status |
|----|----------------|----------|---------|--------|
| P1 | Linkability / Identifiability of appraisal data to an employee | High | Access minimised by role scope; admin blind to content; presence data limited to name/role | Mitigated |
| P2 | Disclosure of sensitive performance notes internally | High | RBAC scope + admin-blindness; recommend field-level AES-256-GCM at rest | Partial |
| P3 | Detectability — who viewed an appraisal | Medium | `APPRAISAL.VIEW` and every action written to the immutable audit log | Mitigated |
| P4 | Non-repudiation (privacy tension) of signatures | Low | By design and lawful for sign-off; balanced against integrity requirements | Mitigated |
| P5 | Unawareness of processing | Medium | Privacy notice, lawful-basis & processing register in-app; DPIA/ROPA sign-off is organizational | Partial |
| P6 | Non-compliance — retention / rights | High | DSAR export (Art. 15/20) & erase/anonymize (Art. 17); retention schedule defined; auto-purge is operational | Partial |

## Top risks & next steps

| Priority | Action | Why |
|----------|--------|-----|
| High | Enforce Entra mode in production (disable dev-mock) | The `x-dev-upn` path trusts a header for identity; prod must run Entra-only and ideally hard-fail if mock auth is detected (S2) |
| Medium | Add application rate-limiting + edge security headers | No throttling today (D1); add `@nestjs/throttler` and set CSP / HSTS / X-Frame-Options / Referrer-Policy at nginx (I3) |
| Medium | Move secrets to a managed store; passwordless Postgres | Graph secret & DB credentials in env (I5); resolve via Key Vault / OpenBao and use TLS client-cert DB auth |
| Medium | Field-level encryption for free-text at rest | Comments and self-assessment prose warrant AES-256-GCM envelope encryption beyond full-disk (I4 / P2) |
| Medium | Ship the audit chain to an append-only / SIEM store | Hash-chaining detects tampering but a DBA can delete rows; forward to WORM/SIEM for prevention (T4) |
| Low | Commission an independent penetration test | Automated checks and this model are the baseline; a human engagement is the remaining assurance step |
| Low | Formalize DPIA / ROPA sign-off + retention auto-purge | Drafted from real behaviour; needs DPO / MBL §11 review and a scheduled purge job (P5 / P6) |

## Control framework mapping

| Framework | Control | How it is met | Status |
|-----------|---------|---------------|--------|
| ISO 27001 | A.9.2 Access provisioning | RBAC via Entra app roles; JML synced from the directory | Mitigated |
| ISO 27001 | A.12.4 Logging & monitoring | Immutable append-only hash-chained audit log; 24-month retention | Mitigated |
| NIST CSF | PR.AC-7 Authentication | MFA via Conditional Access, SSO, no local credentials | Mitigated |
| NIST CSF | DE.CM-1 Continuous monitoring | Sign-in risk / anomalous-access alerts (Entra ID Protection) — tenant-side | Partial |
| NIS2 | Art. 21 Risk-management measures | Risk register (this model), encryption, MFA, incident handling | Mitigated |
| GDPR | Art. 5 / 17 Minimization & erasure | DSAR export + erase/anonymize; retention schedule (auto-purge pending) | Partial |
| GDPR | Art. 32 Security of processing | TLS, RBAC, audit logging; field-level at-rest encryption pending | Partial |
| STRIDE | Tampering / Repudiation | Locked records, hash-chained audit, attributed e-signatures | Mitigated |
| MITRE ATT&CK | T1078 Valid accounts | Conditional Access, MFA, least-privilege app roles | Mitigated |

## Verdict

**Sound by design (3.9/5)** — the high-severity threats are mitigated in code; the residual
items are hardening and operational, not architectural. Authorization is server-authoritative
(roles from the validated token only, every appraisal route guarded, the Platform Administrator
structurally blind to appraisal content). Integrity and non-repudiation are strong (locked
records, server-recomputed scores, whitelisting validation, an append-only hash-chained audit
log, dual e-signature with MSAL step-up). What remains before external production exposure:
enforce Entra mode, add rate-limiting + edge security headers, adopt a secret manager with
passwordless Postgres, add field-level encryption, ship the audit chain to a WORM/SIEM store,
and commission an independent penetration test plus DPIA/ROPA sign-off.

---

*Method: STRIDE (per data-flow) + LINDDUN (privacy). Evidence drawn from the API source and the
19 e2e tests. Severity is inherent risk pre-control; status is what ships today. Not a substitute
for an independent human penetration test.*
