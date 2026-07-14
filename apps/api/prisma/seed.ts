/* Seeds the 4 base templates (§6) and, in mock mode, a small dev org. */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedField = { label: string };
type SeedSection = { title: string; type: string; weight: number; fields: SeedField[] };
type SeedTemplate = {
  name: string;
  scope: string;
  icon: string;
  color: string;
  desc: string;
  sections: SeedSection[];
};

const TEMPLATES: SeedTemplate[] = [
  {
    name: 'IT Appraisal',
    scope: 'IT',
    icon: 'BiltemaDPP.IconBolt',
    color: '#1080c0',
    desc: 'Soft skills and technical skills for engineers and IT staff, with goals and a development plan.',
    sections: [
      { title: 'Soft Skills', type: 'rating', weight: 25, fields: [
        { label: 'Communication & clarity' }, { label: 'Collaboration & teamwork' },
        { label: 'Adaptability' }, { label: 'Ownership & accountability' }, { label: 'Mentoring & leadership' } ] },
      { title: 'Technical Skills', type: 'rating', weight: 35, fields: [
        { label: 'Code quality & craftsmanship' }, { label: 'System & architecture design' },
        { label: 'Security awareness (secure SDLC)' }, { label: 'Automation & tooling' }, { label: 'Incident response & reliability' } ] },
      { title: 'Goals & OKRs', type: 'goal', weight: 20, fields: [{ label: 'Objective' }] },
      { title: 'Self-assessment', type: 'text', weight: 0, fields: [{ label: 'Reflection' }] },
      { title: 'Development Plan', type: 'text', weight: 20, fields: [{ label: 'Growth focus' }] },
    ],
  },
  {
    name: 'Finance — Trade / Buying',
    scope: 'Finance Trade',
    icon: 'BiltemaDPP.IconProducts',
    color: '#1c3f8c',
    desc: 'Supplier and category evaluation for retail buyers, scored on historical performance data.',
    sections: [
      { title: 'Supplier Evaluation', type: 'rating', weight: 40, fields: [
        { label: 'Price competitiveness vs market' }, { label: 'Lead-time reliability' }, { label: 'Quality consistency' },
        { label: 'Return / defect rate' }, { label: 'Historical delivery performance' } ] },
      { title: 'Category Performance', type: 'rating', weight: 30, fields: [
        { label: 'Margin contribution' }, { label: 'Sell-through rate' }, { label: 'Stock turnover' } ] },
      { title: 'Negotiation & Sourcing', type: 'rating', weight: 15, fields: [
        { label: 'Negotiation outcomes' }, { label: 'Supplier diversification' } ] },
      { title: 'Goals & Targets', type: 'goal', weight: 15, fields: [{ label: 'Objective' }] },
    ],
  },
  {
    name: 'Finance',
    scope: 'Finance',
    icon: 'BiltemaDPP.IconSimulator',
    color: '#0c6196',
    desc: 'Controls, reporting accuracy and compliance for finance and accounting roles.',
    sections: [
      { title: 'Financial Controls', type: 'rating', weight: 30, fields: [
        { label: 'Controls discipline' }, { label: 'Risk identification' }, { label: 'Process improvement' } ] },
      { title: 'Reporting Accuracy', type: 'rating', weight: 25, fields: [
        { label: 'Accuracy & timeliness' }, { label: 'Reconciliation quality' } ] },
      { title: 'Compliance', type: 'rating', weight: 20, fields: [
        { label: 'Regulatory compliance' }, { label: 'Audit readiness' } ] },
      { title: 'Stakeholder Management', type: 'rating', weight: 10, fields: [{ label: 'Business partnering' }] },
      { title: 'Goals', type: 'goal', weight: 15, fields: [{ label: 'Objective' }] },
    ],
  },
  {
    name: 'Legal',
    scope: 'Legal',
    icon: 'BiltemaDPP.IconContract',
    color: '#7a2b86',
    desc: 'Contract management, risk, advisory quality and dispute handling for legal counsel.',
    sections: [
      { title: 'Contract Management', type: 'rating', weight: 30, fields: [
        { label: 'Drafting quality' }, { label: 'Turnaround time' }, { label: 'Risk allocation' } ] },
      { title: 'Risk & Compliance', type: 'rating', weight: 25, fields: [
        { label: 'Regulatory awareness' }, { label: 'Issue spotting' } ] },
      { title: 'Advisory Quality', type: 'rating', weight: 20, fields: [
        { label: 'Clarity of advice' }, { label: 'Commercial judgement' } ] },
      { title: 'Dispute & Litigation', type: 'rating', weight: 10, fields: [{ label: 'Case management' }] },
      { title: 'Goals', type: 'goal', weight: 15, fields: [{ label: 'Objective' }] },
    ],
  },
];

async function seedTemplates() {
  for (const t of TEMPLATES) {
    const existing = await prisma.template.findFirst({ where: { name: t.name, system: true } });
    if (existing) continue;
    await prisma.template.create({
      data: {
        name: t.name, scope: t.scope, system: true, icon: t.icon, color: t.color, desc: t.desc,
        sections: {
          create: t.sections.map((s, si) => ({
            title: s.title, type: s.type, weight: s.weight, order: si,
            fields: { create: s.fields.map((f, fi) => ({ label: f.label, order: fi })) },
          })),
        },
      },
    });
    console.log(`  seeded template: ${t.name}`);
  }
}

/* Dev org — only when explicitly requested (mock mode). Mirrors the roles in §3. */
async function seedDevOrg() {
  if (process.env.SEED_DEV_ORG !== 'true') return;
  const upsert = (u: any) => prisma.user.upsert({ where: { upn: u.upn }, update: u, create: u });

  const admin = await upsert({ upn: 'admin@birgma.com', email: 'admin@birgma.com', displayName: 'Platform Admin', department: 'IT Operations', org: 'IT', appRoles: ['Appraisal.Admin'], entraGroups: ['SG-App-Admins'], mfaEnabled: true });
  const cio = await upsert({ upn: 'cio@birgma.com', email: 'cio@birgma.com', displayName: 'Chris Iverson (CIO)', department: 'Executive', org: 'IT', appRoles: ['Appraisal.Exec.CIO'], entraGroups: ['SG-Exec-IT'], mfaEnabled: true });
  const cto = await upsert({ upn: 'cto@birgma.com', email: 'cto@birgma.com', displayName: 'Tara Olsson (CTO)', department: 'Executive', org: 'IT', appRoles: ['Appraisal.Exec.CTO'], entraGroups: ['SG-Exec-IT'], mfaEnabled: true });
  const cfo = await upsert({ upn: 'cfo@birgma.com', email: 'cfo@birgma.com', displayName: 'Fredrik Berg (CFO)', department: 'Executive', org: 'Finance', appRoles: ['Appraisal.Exec.CFO'], entraGroups: ['SG-Exec-Finance'], mfaEnabled: true });
  const md = await upsert({ upn: 'md@birgma.com', email: 'md@birgma.com', displayName: 'Maria Dahl (MD)', department: 'Executive', org: 'Group', appRoles: ['Appraisal.Exec.MD'], entraGroups: ['SG-Exec'], mfaEnabled: true });
  const manager = await upsert({ upn: 'manager@birgma.com', email: 'manager@birgma.com', displayName: 'Erik Lindqvist', department: 'IT — Platform', org: 'IT', appRoles: ['Appraisal.Manager.IT'], entraGroups: ['SG-IT-Managers'], mfaEnabled: true });

  const employees = [
    { upn: 'anna@birgma.com', displayName: 'Anna Nyström', department: 'IT — Platform' },
    { upn: 'johan@birgma.com', displayName: 'Johan Berg', department: 'IT — Infrastructure' },
    { upn: 'sara@birgma.com', displayName: 'Sara Holm', department: 'IT — Security' },
  ];
  for (const e of employees) {
    await upsert({ upn: e.upn, email: e.upn, displayName: e.displayName, department: e.department, org: 'IT', managerId: manager.id, appRoles: ['Appraisal.Employee'], entraGroups: ['SG-Appraisal-Employees'], mfaEnabled: true });
  }
  console.log('  seeded dev org (admin, execs, 1 manager, 3 employees)');
}

async function main() {
  console.log('Seeding…');
  await seedTemplates();
  await seedDevOrg();
  console.log('Seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
