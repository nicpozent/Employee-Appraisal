# Employee Appraisal Platform — Biltema · Birgma

A group-wide employee performance-appraisal platform. Employees complete a
role-specific self-assessment; managers complete a mirrored review, decide
(approve / request changes / reject), and both parties electronically sign;
the appraisal is then locked. Microsoft **Entra ID** provides SSO and app
roles, and **Microsoft Graph** imports users from Entra groups and sends
transactional emails and reminders. Every state change is written to an
immutable, hash-chained audit log.

This repository contains a full, containerized implementation built to the
spec in [`CLAUDE.md`](./CLAUDE.md). The original design prototype
(`Appraisals.dc.html`, `_ds/`, `support.js`) is kept for reference.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite, React Query, Zustand, MSAL |
| Backend | NestJS (Node + TS), Prisma ORM |
| Database | PostgreSQL 16 |
| Auth | Microsoft Entra ID (OIDC + PKCE) with a dev-mock fallback |
| Email / directory | Microsoft Graph (`sendMail`, group members) |
| Packaging | Docker + docker-compose (three services: `db`, `api`, `web`) |

Monorepo layout:

```
apps/
  api/   NestJS API, Prisma schema/migrations/seed
  web/   React SPA (all 15 screens)
docker-compose.yml
.env.example
```

## Quick start (Docker — recommended)

```bash
cp .env.example .env         # defaults run in dev-mock auth mode
docker compose up --build
```

- Web UI: <http://localhost:5173>
- API:    <http://localhost:4000/api/health>

The API container runs migrations and seeds the 4 base templates on start.
To also seed a demo org (admin, execs, a manager, employees), set
`SEED_DEV_ORG=true` in the environment before first boot, or run:

```bash
docker compose exec api sh -c "SEED_DEV_ORG=true npx prisma db seed"
```

In **dev-mock** mode the sign-in screen shows a developer sign-in list so you
can preview every role without a live tenant.

## Local development (without Docker)

Requires Node 20+ and a local PostgreSQL.

```bash
npm install
# point apps/api at your DB:
export DATABASE_URL="postgresql://appraisal:appraisal@localhost:5432/appraisal?schema=public"
npm --workspace apps/api run db:migrate:dev      # create schema
SEED_DEV_ORG=true npm --workspace apps/api run db:seed
npm run dev                                       # api on :4000, web on :5173
```

## Connecting Microsoft Entra ID (production)

1. Register an **Enterprise Application** in Entra ID (Azure Portal).
2. Define **app roles** (`Appraisal.Employee`, `Appraisal.Manager.IT`,
   `Appraisal.Exec.CTO/CIO/CFO/MD`, `Appraisal.Admin`) and assign them via
   security groups.
3. Grant Graph **application** permissions: `User.Read.All`,
   `GroupMember.Read.All`, `Directory.Read.All`, `Mail.Send` (admin consent).
4. Fill in `.env`:
   ```
   AUTH_MODE=entra
   ENTRA_TENANT_ID=…
   ENTRA_CLIENT_ID=…
   ENTRA_CLIENT_SECRET=…          # store in a secret manager, never commit
   GRAPH_SENDER_UPN=appraisals@yourtenant.onmicrosoft.com
   ENTRA_IMPORT_GROUP_IDS=<group-object-id>,<group-object-id>
   VITE_AUTH_MODE=entra
   VITE_ENTRA_TENANT_ID=…
   VITE_ENTRA_CLIENT_ID=…
   ```
5. Rebuild. The SPA now uses MSAL redirect sign-in; the API validates Entra
   JWTs (JWKS) and reads roles from the token. When Entra is configured, the
   developer sign-in list is disabled automatically.

### Importing users from Entra

Sign in as a Platform Administrator → **Users & roles** → *Import users from
Entra groups*. Enter group object IDs (or use `ENTRA_IMPORT_GROUP_IDS`) and
**Run import**. Members are synced and app roles are derived from the
group → role map. In dev-mock mode the import is simulated with sample users.

### Reminders

A scheduled sweep (default daily 08:00, `REMINDERS_CRON`) emails users and
managers who have an outstanding action — self-assessment due, a **pending
review/approval**, or a required signature — via Graph. Admins can trigger it
on demand with `POST /api/reminders/run`. Configure the lead time with
`REMINDER_LEAD_DAYS`.

## Security highlights

- **Admin-blindness**: appraisal content endpoints return `403` for the
  Platform Administrator role — enforced server-side (see `AuthGuard` +
  `@NoAdmin()`).
- **RBAC & scope**: every request is authorized by role and scoped
  (`ScopeService`) — appraisee → self, manager → team, CTO/CIO → IT org,
  CFO → approved only, MD → all.
- **Immutable audit log**: append-only, SHA-256 hash-chained
  (`GET /api/audit/verify` checks integrity).
- **Dual e-signature**: both parties sign before an appraisal locks;
  production signing uses MSAL step-up re-auth (no passwords stored).

## Key API endpoints

`GET /me` · `GET /appraisals` · `GET/PATCH /appraisals/:id` ·
`POST /appraisals/:id/{submit,manager-review,decision,sign}` ·
`GET/POST/PUT /templates` (+`/duplicate`) · `GET/POST /cycles` (+`/extend`) ·
`GET /users` · `POST /users/import` · `GET /notifications` · `GET /audit` ·
`GET /analytics` · `GET /security` · `POST /gdpr/{export,erase}` ·
`POST /reminders/run`.

See `CLAUDE.md` for the complete product specification.
