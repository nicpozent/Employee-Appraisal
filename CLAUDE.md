# CLAUDE.md — Employee Appraisal Platform (Biltema · Birgma)

> Paste this file into your Claude Code project root. It is the complete build spec for turning the
> attached front-end design into a production application. Read it end to end before writing code.

---

## 0. What this bundle is

- `Appraisals.dc.html` — the **front-end design reference**. It is a self-contained HTML prototype
  (a "Design Component") showing the exact intended look, layout, screens, and interactions.
  **It is not production code to ship as-is.** Recreate these screens in your target stack
  (see §2), pixel-for-pixel, using the real backend described here.
- `_ds/…` — the Biltema DPP design-system bundle (CSS tokens + React components) the prototype uses.
  Treat it as the **visual source of truth** (colors, type, spacing, chips, tables, buttons).
- `assets/lockup.png`, `biltema.png`, `birgma.png` — the transparent combined brand lockup and the
  two individual logos. Use `lockup.png` on white surfaces.
- `support.js` — the prototype runtime. **Ignore for production** (it only powers the .dc.html preview).

**Fidelity: HIGH.** Colors, typography, spacing, component styling, copy, and interaction flows are
final. Reproduce them exactly. The prototype ships with **no data** — every list is empty with an
empty-state, forms are blank, KPIs read `0`/`—`. Your job is to wire real data + backend behind these
exact screens. Do **not** redesign screens or change layout — build what is shown.

To preview the design: open `Appraisals.dc.html` in a browser. On the sign-in screen the "Preview a
role" cards let you enter the app as each role to inspect every screen (this shortcut does not exist in
production — real entry is Microsoft SSO only). The top bar has an appearance switcher (see §12).

---

## 1. Product summary

A group-wide employee performance-appraisal platform for the Biltema/Birgma organization. Employees
complete a self-assessment against a role-specific template; their manager completes a mirrored review
(same questions, same scoring) and adds comments; both submissions are stored together; the manager
decides (approve / request modification / reject); on approval **both parties electronically sign**;
the appraisal is then locked. Admins define templates and cycles, set target dates (and extend them),
and manage roles. Every state change emails the relevant people via Microsoft Graph and is written to
an immutable audit log. The whole app is an Entra ID **Enterprise Application** (SSO + app roles).

---

## 2. Target architecture & stack

If the target repo already has a stack, follow its conventions. If greenfield, use:

- **Frontend:** React + TypeScript + Vite. Component-per-screen. State via React Query (server state)
  + a small store (Zustand/Context) for session/role/theme.
- **Auth:** Microsoft Entra ID via **MSAL** (`@azure/msal-browser` + `@azure/msal-react`), OIDC
  authorization-code + PKCE. No local passwords. App roles come from the ID token `roles` claim.
- **Backend:** ASP.NET Core (C#) or Node (NestJS) REST API. Validate the Entra JWT on every request;
  enforce RBAC server-side (never trust the client role).
- **Email:** Microsoft Graph `POST /users/{id}/sendMail` (application permission `Mail.Send`, or
  delegated on behalf of the actor). Queue + retry; log every send.
- **DB:** PostgreSQL or SQL Server. EU data residency. Encrypt at rest (AES-256), TLS 1.3 in transit.
- **Audit log:** append-only, tamper-evident table (hash-chain each row) — no UPDATE/DELETE.

The design system is React. If your stack differs (Vue, Blazor, native), re-implement the visual tokens
in §12 rather than importing `_ds`.

---

## 3. Roles, access & Entra mapping

Roles are **not managed in-app** — they are Entra ID **app roles** assigned to users directly or via
security groups. The API reads the `roles` claim and authorizes accordingly. Removing the assignment in
Entra revokes access immediately.

| Role | Entra appRole value | Security group | Sees | Can do |
|---|---|---|---|---|
| Employee (Appraisee) | `Appraisal.Employee` | `SG-Appraisal-Employees` | Only their own appraisal | Complete self-assessment, submit, sign |
| Manager | `Appraisal.Manager.IT` | `SG-IT-Managers` | Their **direct team** (IT — Platform / Infrastructure / Security / Data) | Review, score, comment, approve/request/reject, sign, extend own team deadlines |
| CTO | `Appraisal.Exec.CTO` | `SG-Exec-IT` | Entire **IT organization** | View org, analytics |
| CIO | `Appraisal.Exec.CIO` | `SG-Exec-IT` | Entire **IT organization** + compliance/audit/GDPR | View org, analytics, security, audit, GDPR |
| CFO | `Appraisal.Exec.CFO` | `SG-Exec-Finance` | **Approved/finished appraisals only** (read-only, all functions) | View finished appraisals, analytics |
| Managing Director | `Appraisal.Exec.MD` | `SG-Exec` | **Whole organization** | View org, analytics |
| Platform Administrator | `Appraisal.Admin` | `SG-App-Admins` | **No appraisal content at all** | Templates, cycles, users/roles, security, audit, GDPR, notifications; set & extend target dates |

> Note: the "Manager" role's internal key in the prototype is `it_manager` and its default team scope
> is the IT departments. The **display label is "Manager"** everywhere. If managers exist outside IT,
> generalize the scope in §3 (scope resolution) to any `employee.managerId == currentUser.id`.

**Critical rule:** the Platform Administrator must never be able to read appraisal answers, scores, or
comments. Their scope is configuration and scheduling only. Enforce this server-side (appraisal
endpoints return 403 for admin).

**Scope resolution (server-side, per request):**
- appraisee → `appraisal.employeeId == currentUser.id`
- manager → `appraisal.employee.managerId == currentUser.id` (team membership)
- cto/cio → `appraisal.employee.org == 'IT'`
- cfo → `appraisal.status == 'approved'` (any org)
- md → all
- admin → none (appraisal endpoints 403)

### Navigation per role (left rail)
Build the rail dynamically from the role. Items and who sees them:

- **Dashboard** — all roles
- **My appraisal** — appraisee, manager, cto, cio (anyone who is also an appraisee)
- **Team reviews** — manager, cto, cio
- **Organization** — cto, cio, md · label becomes **"Finished appraisals"** for cfo
- **Analytics** — cto, cio, md, cfo
- **Templates** — admin, manager, cto, cio
- **Cycles & dates** — admin, manager, cto, cio
- **Users & roles** — admin
- **Security & compliance** — admin, cio
- **Audit log** — admin, cio
- **Data & GDPR** — admin, cio
- **Notifications** — all roles

---

## 4. Appraisal lifecycle (state machine)

```
not_started ──(employee fills & submits)──▶ submitted
submitted ──(manager completes mirrored review)──▶ submitted (manager_review_done = true)
   then manager decides:
     approve  ──▶ approved (awaiting signatures)
     request  ──▶ changes_requested ──(employee edits & resubmits)──▶ submitted
     reject   ──▶ rejected
approved ──(employee signs)+(manager signs)──▶ approved + signed = true (LOCKED)
```

Statuses and their badge style (reuse the design system chip classes):
`not_started` (st-staged, "Not started"), `in_progress` (st-enriching, "In progress"),
`submitted` (st-published, "Awaiting review"), `changes_requested` (st-uncategorized, "Changes requested"),
`approved` (st-compliant, "Approved"), `rejected` (st-uncategorized, "Rejected").
Once `signed`, show status "Finalized & signed" and lock all fields.

### Scoring
- Rating fields are 1–5. A section's score = mean of its rated fields.
- Overall weighted score (0–100) = Σ over rating sections with weight>0 of `(sectionMean/5) × weight`,
  divided by the summed weights of scored sections, ×100, rounded.
- Two independent scores are stored & shown side-by-side: **Employee** (self) and **Manager**.
- The **Manager** score is the final/official score.

---

## 5. Screens — exhaustive spec

Global shell (all authenticated screens): fixed **left rail** (dark gradient `var(--rail)`, 250px) with
white logo plate, "Signed in as" identity chip, role-filtered nav, and Sign out; **top bar** with
breadcrumb eyebrow + H1 page title, a search box, a notifications bell (unread count badge in `--red`),
the **appearance switcher** (§12), and a "View as" role indicator. On ≤1080px the rail collapses to a
horizontal top nav and content padding shrinks to 24px. Toasts appear top of content in a green success
strip. Every list/table has an **empty state** (centered accent icon tile + Archivo H4 + one muted
sentence) shown when it has no rows — reproduce these.

### 5.1 Sign in
Split screen. Left: dark gradient panel with the brand lockup on a white plate, headline "One appraisal
platform for the whole group.", subcopy, and three trust chips ("Entra ID SSO", "ISO 27001 controls",
"GDPR & NIS2 ready"). Right: "Sign in to continue" + a single **"Sign in with Microsoft"** button (this
triggers the MSAL redirect). Footer note: registered as an Enterprise Application, roles assigned via
Entra ID app roles, MFA via Conditional Access. (The "Preview a role" grid is a prototype-only shortcut
— do not build it in production.)

### 5.2 Dashboard (role-aware, two variations)
Hero action card (navy→accent gradient) whose kicker/title/description/CTA depend on role:
- appraisee → "Complete your self-assessment" → My appraisal
- manager → "N appraisals to review" → Team reviews
- cto/cio → "IT cycle is X% complete" → Organization
- cfo → "N finished appraisals" → Finished appraisals
- md → "Group cycle overview" → Organization
- admin → "Platform configuration" → Templates

A **Briefing / Metrics** segmented toggle (hidden for admin) switches the lower area:
- **Briefing:** left = list of appraisals in scope (status chip, name, dept·template, due, chevron);
  right = activity feed (icon, text, timestamp).
- **Metrics:** left = completion-by-status bars; right = average-score-by-department bars.

Four KPI tiles on top; values depend on role (appraisee: my status / completion / live score / days
left; manager: team / awaiting review / approved / avg score; execs: participants / completed /
in review / avg).

**Admin dashboard** replaces all of the above with config-only content: KPIs (Templates, Active cycles,
Users, Controls), an "Active cycles" scheduling list, and an "Admin activity" feed — **plus an explicit
note that appraisal answers and scores are never visible to this role.**

Empty state: when no appraisals are in scope, the briefing list shows a centered empty state.

### 5.3 My appraisal
Header card: template name + status chip; meta line "Cycle · Reviewer · Due"; a **Live score /100** and
a **Complete %**. Below, a 4-step timeline: **Self-assessment → Manager review → Calibration →
Sign-off**, each with its own due date (per-step deadlines come from the cycle).

Then one card per template section:
- **Rating sections** — each field is a row: label + a 1–5 segmented rating control (34px cells;
  selected = accent fill). Section header shows its weight badge.
- **Text sections** (e.g. Self-assessment, Development Plan) — a textarea.
- **Goal/OKR sections** — a list of objective cards (objective, key-result/metric, status pill).

Footer bar: "On submit, your appraisal locks for editing and an MS Graph notification is sent to
{manager} for review." with **Save draft** and **Submit for review** buttons. Submitting sets status
`submitted`, locks editing, emails the manager, writes audit `APPRAISAL.SUBMIT`.

The form is rendered **from the assigned template** — no data means blank fields, `0/100`, `0%`, status
"Not started", dashes for cycle/reviewer/due.

### 5.4 Team reviews (list)
Filter bar (All / Awaiting review / Changes requested / Approved / Not started, each with a count).
Table: Employee (avatar, name, dept), Template tag, Status chip, Score, Due, chevron. Rows open the
review detail. Empty state when no team appraisals exist.

### 5.5 Review detail (manager) — the core workflow screen
Back link → all reviews. Header: employee name + status chip; meta (dept, template, submitted, due);
**two scores** on the right: **Employee** (muted) and **Manager** (accent). A 3-step stepper:
**Manager review → Decision → Sign-off** (current step highlighted).

Left column:
1. **Employee self-assessment** card (read-only text).
2. **Per-section cards** — each shows the employee's self-rating and a **manager rating** control
   side-by-side per field (columns headed "Self" / "Manager rating"), plus a **manager comment**
   textarea per section. During the review stage these are editable; afterwards they render read-only.
3. When at sign-off: **Final comment — Employee** and **Final comment — Manager** textareas (side by side).

Right rail (changes by stage):
- **Review stage:** "Manager review" card → **Submit manager review** (requires every competency rated;
  stores manager scores + comments alongside the employee's; audit `APPRAISAL.MANAGER_REVIEW`).
- **Decision stage:** "Decision" card → **Approve** / **Request modification** / **Reject**. Each emails
  the employee via Graph and logs it. Approve → sign-off stage.
- **Sign-off stage:** "Electronic sign-off" card with an **Employee** signature block and a **Manager**
  signature block (see §7). When both are signed, the appraisal finalizes & locks, and a "finalized &
  signed" email goes out.
- Always: **Approval & signature chain** card (employee submitted → manager review → employee sign-off →
  manager sign-off), each line green/complete or muted/pending.

### 5.6 Templates (gallery)
Intro copy + **Blank template** button. Grid of template cards: colored icon, System/Custom pill, name,
description, and section/field counts. Clicking a card opens the **builder** pre-loaded with a
customizable copy (system templates open as "… (custom)"). Ship the 4 base templates in §6.

### 5.7 Template builder
Back link → all templates. Left: a name field + function/scope select + a live "Total weight"
(read-only). Then a card per section with:
- reorder ▲▼, an editable **section title**, a **type** select (Rating 1–5 / Long answer / Goals·OKRs /
  Numeric), an editable **weight %**, and a remove (trash) button;
- a list of editable **fields** (label + remove), and an **Add field** row.
An **Add section** button at the bottom.
Right (sticky): Summary (section count, field count, total weight — red unless 100%), a note that saved
templates become reusable across cycles/teams, **Save template**, **Cancel**. Saving validates name
present and **weights total 100%**, then persists a reusable custom template.

### 5.8 Cycles & target dates
Intro + **New cycle**. Per cycle card: name + status chip; scope + participant count; **Target
completion** date; if manageable, an **Extend target date** button. A row of **step tiles**
(Self-assessment, Manager review, Calibration, Sign-off) each with a due date and a state pill
(Complete/In progress/Upcoming). Overall progress bar. For active cycles, a **per-participant deadline
grid** — each participant shows their name, team, individual due date, an "Extended" badge if
applicable, and an extend button. Empty state: "No cycles defined".

**Extend flow (admin / managers):** opens a modal — shows the current date, push forward by
**+1 week / +2 weeks / +1 month**. Whole-cycle extension shifts the completion date **and every step and
participant date**; single-user extension shifts only that person and flags them "Extended". Either way:
affected users are emailed (Graph) and an audit `CYCLE.EXTEND_DATE` entry is written.

### 5.9 Notifications
Two columns. Left: **Notification & email log** ("Sent via MS Graph") — each entry has a type icon,
subject, preview, recipient + timestamp; clicking selects it. Right: **Email preview** — a branded email
mock (navy header with lockup, subject, body, a CTA button, and an audit footnote). Empty state when no
notifications. See §8 for the email templates.

### 5.10 Organization / Finished appraisals
(cto/cio/md, and cfo as read-only "Finished appraisals".) Four KPI tiles + a function filter bar
(All / IT / Finance / Legal …). Table: Employee, Department, Template, Status, Score, Reviewed by. Exec
roles can open review detail; cfo is read-only. Empty state when nothing in scope.

### 5.11 Analytics
Grid of cards: **Average score by department** (bars), **Cycle completion** (status bars),
**Competency heat** (per-competency cells across the org), **Calibration & distribution** (score
histogram). All derived from real data; empty/zero when none.

### 5.12 Security & compliance (admin, cio)
Three summary metric cards (Controls implemented, ISO 27001 status, NIS2 readiness). A **Control
framework mapping** table (Framework pill, Control code+name, How it's met, Status), and an
**Architecture & controls overview** card grid (Authentication, Authorization, Data at rest, Data in
transit, Auditability, Notifications). Content is in §9 — treat it as product spec, not user data.

### 5.13 Audit log (admin, cio)
Banner: immutable, append-only, retained 24 months then auto-purged (ISO 27001 A.12.4 · NIS2 logging).
Table: Timestamp, Actor, Action, Object, Source IP, Result. Empty until events are generated. Every
action in this spec that says "audit …" appends a row here.

### 5.14 Data protection & GDPR (admin, cio)
- **DSAR** card: pick an employee, then **Export data** (Art. 15/20 — JSON+PDF), **Rectify**, or
  **Erase & anonymize** (Art. 17). Confirmation notice + audit entry on completion.
- **Retention schedule**: Active appraisals (cycle + 3y), Audit & access logs (24 months), Email
  notifications (12 months), Leaver records (anonymized on exit, 90 days).
- **Processing & lawful basis**: Performance appraisal (legitimate interest), SSO authentication
  (contract), Status notifications (legitimate interest), Audit logging (legal obligation).
- **Consent & transparency**: privacy notice acknowledged, processing record published, sub-processor
  list (MS Graph) documented.

### 5.15 Users & roles / Enterprise Application (admin)
- **Enterprise Application — Entra ID** card: Application (client) ID, Directory (tenant) ID, Sign-on
  URL, Token/SSO (OIDC+SAML · MFA), and the granted **Graph scopes**: `User.Read`, `Mail.Send`,
  `GroupMember.Read.All`, `Directory.Read.All`. (Show real values from config; prototype shows
  "— configure in Azure" placeholders.)
- **App roles — mapped from Entra ID** table (see §3) with a notice that access is determined by the
  Entra assignment.
- **User directory** table: User (avatar, name, email), Department, App role, Entra group, MFA, Last
  sign-in. Populated from directory sync; empty state until connected.

---

## 6. The four base templates (seed these exactly)

Weights per template must total 100%. `type` ∈ rating | text | goal | number. Rating fields are 1–5.

**IT Appraisal** — scope "IT" — soft + technical skills for engineers/IT staff.
- Soft Skills — rating — 25% — Communication & clarity · Collaboration & teamwork · Adaptability ·
  Ownership & accountability · Mentoring & leadership
- Technical Skills — rating — 35% — Code quality & craftsmanship · System & architecture design ·
  Security awareness (secure SDLC) · Automation & tooling · Incident response & reliability
- Goals & OKRs — goal — 20%
- Self-assessment — text — 0%
- Development Plan — text — 20%

**Finance — Trade / Buying** — scope "Finance Trade" — retail buyers evaluate what to buy from suppliers
based on historical performance data.
- Supplier Evaluation — rating — 40% — Price competitiveness vs market · Lead-time reliability ·
  Quality consistency · Return / defect rate · Historical delivery performance
- Category Performance — rating — 30% — Margin contribution · Sell-through rate · Stock turnover
- Negotiation & Sourcing — rating — 15% — Negotiation outcomes · Supplier diversification
- Goals & Targets — goal — 15%

**Finance** — scope "Finance".
- Financial Controls — rating — 30% — Controls discipline · Risk identification · Process improvement
- Reporting Accuracy — rating — 25% — Accuracy & timeliness · Reconciliation quality
- Compliance — rating — 20% — Regulatory compliance · Audit readiness
- Stakeholder Management — rating — 10% — Business partnering
- Goals — goal — 15%

**Legal** — scope "Legal".
- Contract Management — rating — 30% — Drafting quality · Turnaround time · Risk allocation
- Risk & Compliance — rating — 25% — Regulatory awareness · Issue spotting
- Advisory Quality — rating — 20% — Clarity of advice · Commercial judgement
- Dispute & Litigation — rating — 10% — Case management
- Goals — goal — 15%

Choosing a template opens the customization studio (builder) so a copy can be adjusted and saved as a
reusable custom template.

---

## 7. Electronic signature (dual sign-off)

On an approved appraisal, both the employee and the manager must sign before it locks. Signing is a
two-step modal:

1. **Details:** First name, Last name, Date (prefill from the signer's profile & today).
2. **Credential:** an Entra ID **re-authentication** step (username + password, styled as Microsoft
   sign-in). In production this must be a real step-up auth (MSAL `acquireTokenPopup` with
   `prompt=login`, or a fresh interactive re-auth), **not** a form that stores a password. On success,
   record a signature: signer name, date, account (UPN), and server timestamp.

Each signature renders as a cursive-styled name with date + account and a "Signed" badge. Every
signature writes an audit `APPRAISAL.ESIGN` (non-repudiable — attributed identity + timestamp + IP;
reference eIDAS / ISO 27001 A.12.4). When **both** signatures exist, set `signed = true`, lock the
record, and send the "Appraisal finalized & signed" email to the employee.

---

## 8. Notifications via Microsoft Graph

Send on each transition using Graph `sendMail`. All emails are branded (navy header with the lockup),
carry a CTA deep-link into the app, and are logged to the notification log + audit (`GRAPH.MAIL_SEND`).
Recipients & templates:

| Trigger | To | Subject | CTA |
|---|---|---|---|
| Employee submits | manager | "Appraisal submitted for your review" | Open review |
| Manager requests changes | employee | "Changes requested on your appraisal" | Edit appraisal |
| Manager rejects | employee | "Your appraisal was not approved" | Contact manager |
| Manager approves | employee | "Appraisal approved — signatures required" | Sign |
| Both signed | employee (+ HR) | "Appraisal finalized & signed" | View appraisal |
| Deadline extended | affected user(s) | "Target date extended" | Complete now |
| Deadline approaching | employee | "Reminder: self-assessment due in N days" | Complete now |

Notification types (for the log icon/colour): submitted, approved, changes, rejected, reminder.
Automated reminders fire as step deadlines approach.

---

## 9. Security & compliance requirements

Implement and evidence these controls; the Security screen maps each to a feature.

**Control framework mapping** (framework · code · control · how it's met · status):
- ISO 27001 · A.9.2 · Access provisioning · RBAC via Entra app roles, JML synced from HR · Met
- ISO 27001 · A.12.4 · Logging & monitoring · Immutable append-only audit log, 24-month retention · Met
- NIST CSF · PR.AC-7 · Authentication · MFA via Conditional Access, SSO, no local credentials · Met
- NIST CSF · DE.CM-1 · Continuous monitoring · Sign-in risk + anomalous-access alerts (Entra ID Protection) · Partial
- NIS2 · Art.21 · Risk management measures · Risk register, encryption, MFA, incident handling · Met
- GDPR · Art.5/17 · Data minimization & erasure · Retention auto-purge, DSAR export & anonymization · Met
- GDPR · Art.32 · Security of processing · AES-256 at rest, TLS 1.3, RBAC, audit logging · Met
- STRIDE · Tampering · Integrity of appraisals · Submitted appraisals locked; changes require explicit request; all logged · Met
- STRIDE · Repudiation · Non-repudiation · Every decision & signature attributed to an authenticated identity + timestamp + IP · Met
- MITRE ATT&CK · T1078 · Valid-accounts abuse · Conditional Access, MFA, least-privilege app roles · Monitored

**Threat model (STRIDE) to apply across endpoints:** Spoofing → Entra SSO + MFA; Tampering → locked
records + hash-chained audit; Repudiation → attributed audit + e-signatures; Information disclosure →
RBAC scope enforcement (esp. admin blindness to appraisal content) + encryption; DoS → rate limiting;
Elevation of privilege → server-side role checks on every request, never trust client role.

**Architecture overview** (show on Security screen): Authentication (Entra ID SSO + MFA),
Authorization (app roles & RBAC, least privilege), Data at rest (AES-256, EU region, managed key vault),
Data in transit (TLS 1.3, HSTS), Auditability (append-only log, 24-month retention), Notifications
(MS Graph mail, scoped `Mail.Send`).

**GDPR:** honor DSAR (access/portability/erasure) within 30 days; enforce the retention schedule;
maintain the records of processing & lawful basis in §5.14; keep the sub-processor list (MS Graph).

**NIS2:** documented risk-management measures, incident handling, and logging (the audit log supports
the logging obligation).

---

## 10. Data model (suggested entities)

- **User** — id, entraObjectId, upn/email, displayName, department, org (IT/Finance/Legal/…), managerId,
  appRoles[] (from Entra), mfaEnabled, lastSignIn.
- **Template** — id, name, scope, system(bool), createdBy, sections[] → { id, title, type, weight,
  order, fields[] → { id, label, order } }.  (Weights sum to 100.)
- **Cycle** — id, name, scope, status, targetDate, steps[] → { label, dueDate, state }, closed(bool),
  participants[] → { userId, dueDate, extended(bool) }.
- **Appraisal** — id, employeeId, managerId, templateId, cycleId, status, signed(bool),
  employeeSelf{ ratings{fieldId:1-5}, texts{fieldId}, goals[] }, managerReview{ ratings, sectionComments },
  employeeScore, managerScore, finalCommentEmployee, finalCommentManager,
  signatures{ employee?{name,date,account,signedAt,ip}, manager?{…} }, submittedAt, decidedAt.
- **Notification** — id, kind, subject, preview/body, toUserId, sentAt, read(bool), graphMessageId.
- **AuditEvent** — id, ts, actorId, action, objectRef, sourceIp, result, prevHash, hash (append-only).

Audit `action` values used in the design: `AUTH.SIGN_IN`, `APPRAISAL.VIEW`, `APPRAISAL.SAVE`,
`APPRAISAL.SUBMIT`, `APPRAISAL.MANAGER_REVIEW`, `APPRAISAL.APPROVE`, `APPRAISAL.REQUEST_CHANGES`,
`APPRAISAL.REJECT`, `APPRAISAL.ESIGN`, `CYCLE.EXTEND_DATE`, `TEMPLATE.UPDATE`, `GRAPH.MAIL_SEND`,
`GDPR.EXPORT`.

---

## 11. API surface (suggested)

- `GET /me` → profile + roles (from token).
- `GET /appraisals?scope=…` → list within the caller's scope (server-enforced; admin → 403).
- `GET /appraisals/{id}` · `PATCH /appraisals/{id}` (self-edit while not_started/changes_requested).
- `POST /appraisals/{id}/submit`
- `POST /appraisals/{id}/manager-review` (ratings + comments)
- `POST /appraisals/{id}/decision` { action: approve|request|reject, comment }
- `POST /appraisals/{id}/sign` { party: employee|manager } (after step-up re-auth)
- `GET/POST/PUT /templates` · `POST /templates/{id}/duplicate`
- `GET/POST /cycles` · `POST /cycles/{id}/extend` { scope: cycle|user, userId?, days }
- `GET /notifications` · `GET /audit` · `GET /users`
- `POST /gdpr/export` · `POST /gdpr/erase`
All mutating endpoints: validate token, enforce RBAC, write audit, trigger Graph mail where applicable.

---

## 12. Design tokens, brand & theming (reproduce exactly)

Brand marks combine **Biltema** (cobalt blue) and **Birgma** (navy + red dot). Use the transparent
`assets/lockup.png` on white plates only.

**Three appearance themes** (switcher in the top bar; persist the choice per user):
- **Daylight** (default) — light UI.
- **Command** — graphite/near-black dark mode, brighter cobalt accent.
- **Midnight** — deep-navy dark mode.

Each theme is a full set of CSS custom-property overrides applied on a `data-theme` attribute on the
root element; the whole app is tokenized so every surface follows the theme. Implement themes as a
`data-theme="daylight|command|midnight"` on `<html>` and override the tokens below per theme. Copy the
exact hex values from the `[data-theme="command"]` and `[data-theme="midnight"]` blocks in the
prototype's `<style>` (top of `Appraisals.dc.html`).

Core tokens (Daylight / default values; the DS bundle defines the base, the app adds brand extensions):
- `--accent: #1080c0` (Biltema cobalt, primary) · `--accent-700: #0c6196` · `--accent-050: #e9f3fa`
- `--navy: #1c3f8c` · `--navy-700: #162f6a` · `--navy-050: #eaeefa` · `--rail` (rail gradient)
- `--red: #d81b48` (Birgma accent, destructive/reject) · red bg `#fdeaf0`
- Text `--ink` / `--ink-2` / `--muted`; grounds `--surface` / `--paper`; borders `--line` / `--line-2`
- Semantic: `--ok`, `--warn`, `--crit` each with a `*-bg` tint · `--shadow` / `--shadow-sm`
- Hero: `linear-gradient(120deg,var(--navy),var(--accent))`

Type: **Inter** (UI), **Archivo** (display headings, weight 700–800, tight letter-spacing), **IBM Plex
Mono** (numbers, IDs, timestamps, dates). Rating cells 34px; hit targets ≥that. Radii `--r-sm/md/lg`.
Signatures render in a cursive face (`'Segoe Script','Bradley Hand','Brush Script MT',cursive`) in
`var(--navy)`.

Reuse design-system component classes where possible: `.chip` + `st-*` (status badges), `.comp` +
`ok/na/no` (compliance dots), `.tag`, `.pill`, `.btn`/`.btn-primary`/`.btn-ghost`, `.table-wrap` tables,
`.filter-bar`/`.filter-btn`, `.card-head`/`.card-title`, `.field`/`.form-grid`, `.notice`, `.overlay`/
`.modal`. Icons: the `BiltemaDPP.Icon*` line-icon set (stroke = currentColor).

Empty states (used throughout the no-data build): centered icon tile (accent-050 bg) + Archivo H4 +
one muted sentence. Reproduce for every list/table when it has no rows.

---

## 13. Responsiveness & accessibility
- Fluid layouts; the shell collapses the rail to a top nav at ≤1080px. Cards/grids reflow with `auto-fit`.
- Keyboard-navigable; visible focus. Rating controls, filters, modals, and the theme switcher must be
  operable by keyboard.
- Color is never the only signal (chips carry text; compliance dots carry labels). Verify contrast in
  all three themes.
- Respect the 30-day DSAR clock and show due dates in the mono face.

---

## 14. Build checklist / TODOs
Search the front-end for `TODO(backend)` — each marks where seeded data was removed and a real fetch goes.
1. Wire MSAL SSO + role claim; build the role-filtered shell & guard every route + API by role.
2. Enforce admin blindness (no appraisal content) and per-role scope server-side.
3. Appraisal CRUD + submit + the mirrored manager review + decision + dual e-signature + lock.
4. Template CRUD + builder (weight=100 validation) + duplicate-to-customize + the 4 seed templates.
5. Cycles + per-step & per-participant target dates + extend (cycle/user) + reminders.
6. Graph email on every transition + notification log; branded templates in §8.
7. Append-only audit log (hash-chained) + Audit screen; log every action in §10.
8. Security screen (control mapping §9) + GDPR/DSAR + retention + records of processing.
9. Organization + Analytics (real aggregates).
10. Three-theme appearance switcher (§12), persisted per user.
11. Encryption, EU residency, TLS 1.3, rate limiting, and the STRIDE mitigations in §9.
