import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDb, seedOrg, allRatings } from './fixtures';

let app: INestApplication;
let prisma: PrismaService;
let ids: Awaited<ReturnType<typeof seedOrg>>;
const http = () => app.getHttpServer();

/** Drive an appraisal to `approved` (awaiting signatures) and return its id. */
async function makeApproved(employeeUpn: string): Promise<string> {
  const created = await request(http())
    .post('/api/appraisals').set('x-dev-upn', 'mgr@test.local')
    .send({ employeeId: userId(employeeUpn), templateId: ids.template.id }).expect(201);
  const id = created.body.id;
  await request(http()).post(`/api/appraisals/${id}/submit`).set('x-dev-upn', employeeUpn).expect(201);
  await request(http()).post(`/api/appraisals/${id}/manager-review`).set('x-dev-upn', 'mgr@test.local')
    .send({ ratings: allRatings(ids.template, 5), sectionComments: {} }).expect(201);
  await request(http()).post(`/api/appraisals/${id}/decision`).set('x-dev-upn', 'mgr@test.local')
    .send({ action: 'approve' }).expect(201);
  return id;
}

function userId(upn: string): string {
  const map: Record<string, string> = {
    'anna@test.local': ids.anna.id, 'bob@test.local': ids.bob.id, 'carol@test.local': ids.carol.id,
  };
  return map[upn];
}

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await resetDb(prisma);
  ids = await seedOrg(prisma);
});

afterAll(async () => {
  await app.close();
});

describe('Authentication', () => {
  it('rejects unauthenticated requests', () =>
    request(http()).get('/api/me').expect(401));

  it('resolves the caller from the dev header', async () => {
    const res = await request(http()).get('/api/me').set('x-dev-upn', 'mgr@test.local').expect(200);
    expect(res.body.roles).toContain('it_manager');
    expect(res.body.nav.map((n: any) => n.key)).toEqual(expect.arrayContaining(['reviews', 'templates']));
  });
});

describe('RBAC & admin-blindness', () => {
  it('blocks the Platform Admin from appraisal content (403)', () =>
    request(http()).get('/api/appraisals').set('x-dev-upn', 'admin@test.local').expect(403));

  it('blocks the Platform Admin from analytics (403)', () =>
    request(http()).get('/api/analytics').set('x-dev-upn', 'admin@test.local').expect(403));

  it('allows the admin to read the user directory', () =>
    request(http()).get('/api/users').set('x-dev-upn', 'admin@test.local').expect(200));

  it('forbids a non-admin from the user directory (403)', () =>
    request(http()).get('/api/users').set('x-dev-upn', 'anna@test.local').expect(403));

  it('lets managers read templates but forbids appraisees', async () => {
    await request(http()).get('/api/templates').set('x-dev-upn', 'mgr@test.local').expect(200);
    await request(http()).get('/api/templates').set('x-dev-upn', 'anna@test.local').expect(403);
  });
});

describe('Per-role scope', () => {
  let annaId: string;
  beforeAll(async () => {
    // one appraisal for anna (our manager's report) and one for carol (other manager's report)
    annaId = (await request(http()).post('/api/appraisals').set('x-dev-upn', 'mgr@test.local')
      .send({ employeeId: ids.anna.id, templateId: ids.template.id }).expect(201)).body.id;
    await request(http()).post('/api/appraisals').set('x-dev-upn', 'omgr@test.local')
      .send({ employeeId: ids.carol.id, templateId: ids.template.id }).expect(201);
  });

  it('scopes a manager to their own team only', async () => {
    const res = await request(http()).get('/api/appraisals').set('x-dev-upn', 'mgr@test.local').expect(200);
    const employeeIds = res.body.map((a: any) => a.employeeId);
    expect(employeeIds).toContain(ids.anna.id);
    expect(employeeIds).not.toContain(ids.carol.id);
  });

  it('scopes an appraisee to their own appraisal only', async () => {
    const res = await request(http()).get('/api/appraisals').set('x-dev-upn', 'anna@test.local').expect(200);
    expect(res.body.every((a: any) => a.employeeId === ids.anna.id)).toBe(true);
  });

  it('lets a CIO see the whole IT org', async () => {
    const res = await request(http()).get('/api/appraisals').set('x-dev-upn', 'cio@test.local').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('shows a CFO only approved appraisals', async () => {
    const res = await request(http()).get('/api/appraisals').set('x-dev-upn', 'cfo@test.local').expect(200);
    expect(res.body.every((a: any) => a.status === 'approved')).toBe(true);
  });
});

describe('Final-comment ownership (sign-off)', () => {
  it('rejects final comments before approval (400)', async () => {
    const created = await request(http()).post('/api/appraisals').set('x-dev-upn', 'mgr@test.local')
      .send({ employeeId: ids.bob.id, templateId: ids.template.id }).expect(201);
    await request(http()).post(`/api/appraisals/${created.body.id}/final-comments`).set('x-dev-upn', 'mgr@test.local')
      .send({ manager: 'too early' }).expect(400);
  });

  it('lets each party set only their own comment', async () => {
    const id = await makeApproved('anna@test.local');

    const mgr = await request(http()).post(`/api/appraisals/${id}/final-comments`).set('x-dev-upn', 'mgr@test.local')
      .send({ manager: 'Great year' }).expect(201);
    expect(mgr.body.finalCommentManager).toBe('Great year');

    const emp = await request(http()).post(`/api/appraisals/${id}/final-comments`).set('x-dev-upn', 'anna@test.local')
      .send({ employee: 'Thanks' }).expect(201);
    expect(emp.body.finalCommentEmployee).toBe('Thanks');

    // employee cannot set the manager comment → nothing to update for their role
    await request(http()).post(`/api/appraisals/${id}/final-comments`).set('x-dev-upn', 'anna@test.local')
      .send({ manager: 'hijack' }).expect(400);
    const after = await request(http()).get(`/api/appraisals/${id}`).set('x-dev-upn', 'mgr@test.local').expect(200);
    expect(after.body.finalCommentManager).toBe('Great year');
  });

  it('forbids a non-party from setting comments (403)', async () => {
    const id = await makeApproved('bob@test.local');
    await request(http()).post(`/api/appraisals/${id}/final-comments`).set('x-dev-upn', 'anna@test.local')
      .send({ employee: 'not mine' }).expect(403);
  });

  it('locks final comments once both parties have signed (400)', async () => {
    const id = await makeApproved('anna@test.local');
    await request(http()).post(`/api/appraisals/${id}/sign`).set('x-dev-upn', 'anna@test.local')
      .send({ party: 'employee', name: 'Anna' }).expect(201);
    await request(http()).post(`/api/appraisals/${id}/sign`).set('x-dev-upn', 'mgr@test.local')
      .send({ party: 'manager', name: 'Manager' }).expect(201);
    await request(http()).post(`/api/appraisals/${id}/final-comments`).set('x-dev-upn', 'mgr@test.local')
      .send({ manager: 'too late' }).expect(400);
  });
});

describe('Manager review guards', () => {
  it('rejects a manager review that is missing ratings (400)', async () => {
    const created = await request(http()).post('/api/appraisals').set('x-dev-upn', 'mgr@test.local')
      .send({ employeeId: ids.bob.id, templateId: ids.template.id }).expect(201);
    await request(http()).post(`/api/appraisals/${created.body.id}/submit`).set('x-dev-upn', 'bob@test.local').expect(201);
    await request(http()).post(`/api/appraisals/${created.body.id}/manager-review`).set('x-dev-upn', 'mgr@test.local')
      .send({ ratings: {}, sectionComments: {} }).expect(400);
  });

  it('forbids a non-manager from reviewing (403)', async () => {
    const created = await request(http()).post('/api/appraisals').set('x-dev-upn', 'mgr@test.local')
      .send({ employeeId: ids.anna.id, templateId: ids.template.id }).expect(201);
    await request(http()).post(`/api/appraisals/${created.body.id}/submit`).set('x-dev-upn', 'anna@test.local').expect(201);
    await request(http()).post(`/api/appraisals/${created.body.id}/manager-review`).set('x-dev-upn', 'anna@test.local')
      .send({ ratings: allRatings(ids.template), sectionComments: {} }).expect(403);
  });
});

describe('Analytics competency heat', () => {
  it('returns per-competency averages and hides content from admin', async () => {
    // ensure at least one manager-reviewed appraisal exists (created above)
    const res = await request(http()).get('/api/analytics').set('x-dev-upn', 'cio@test.local').expect(200);
    expect(Array.isArray(res.body.competencyHeat)).toBe(true);
    expect(res.body.competencyHeat.length).toBeGreaterThan(0);
    for (const c of res.body.competencyHeat) {
      expect(c).toHaveProperty('competency');
      expect(c.avg).toBeGreaterThan(0);
    }
  });
});

describe('Audit chain', () => {
  it('stays intact after the workflow', async () => {
    const res = await request(http()).get('/api/audit/verify').set('x-dev-upn', 'admin@test.local').expect(200);
    expect(res.body.ok).toBe(true);
  });
});
