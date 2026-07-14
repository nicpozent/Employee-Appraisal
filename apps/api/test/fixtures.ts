import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  ids: Awaited<ReturnType<typeof seedOrg>>;
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

/** Delete all rows in FK-safe order. */
export async function resetDb(prisma: PrismaService) {
  await prisma.signature.deleteMany();
  await prisma.appraisal.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.cycleParticipant.deleteMany();
  await prisma.cycleStep.deleteMany();
  await prisma.cycle.deleteMany();
  await prisma.field.deleteMany();
  await prisma.section.deleteMany();
  await prisma.template.deleteMany();
  await prisma.user.deleteMany();
}

/** A minimal org + one IT rating template. */
export async function seedOrg(prisma: PrismaService) {
  const mk = (upn: string, displayName: string, appRoles: string[], extra: any = {}) =>
    prisma.user.create({ data: { upn, email: upn, displayName, appRoles, org: 'IT', ...extra } });

  const admin = await mk('admin@test.local', 'Admin', ['Appraisal.Admin']);
  const manager = await mk('mgr@test.local', 'Manager', ['Appraisal.Manager.IT'], { department: 'IT — Platform' });
  const anna = await mk('anna@test.local', 'Anna', ['Appraisal.Employee'], { managerId: manager.id, department: 'IT — Platform' });
  const bob = await mk('bob@test.local', 'Bob', ['Appraisal.Employee'], { managerId: manager.id, department: 'IT — Infra' });
  // An employee under a DIFFERENT manager (out of our manager's scope)
  const otherMgr = await mk('omgr@test.local', 'OtherMgr', ['Appraisal.Manager.IT']);
  const carol = await mk('carol@test.local', 'Carol', ['Appraisal.Employee'], { managerId: otherMgr.id });
  const cio = await mk('cio@test.local', 'CIO', ['Appraisal.Exec.CIO']);
  const cfo = await mk('cfo@test.local', 'CFO', ['Appraisal.Exec.CFO'], { org: 'Finance' });

  const template = await prisma.template.create({
    data: {
      name: 'IT Test', scope: 'IT', system: true,
      sections: {
        create: [
          { title: 'Soft Skills', type: 'rating', weight: 50, order: 0, fields: { create: [{ label: 'Communication', order: 0 }, { label: 'Teamwork', order: 1 }] } },
          { title: 'Technical', type: 'rating', weight: 50, order: 1, fields: { create: [{ label: 'Code quality', order: 0 }, { label: 'Design', order: 1 }] } },
        ],
      },
    },
    include: { sections: { include: { fields: true } } },
  });

  return { admin, manager, anna, bob, otherMgr, carol, cio, cfo, template };
}

/** Rating map with every rating field set to `v`. */
export function allRatings(template: any, v = 4): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of template.sections) if (s.type === 'rating') for (const f of s.fields) out[f.id] = v;
  return out;
}
