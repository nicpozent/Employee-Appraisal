import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/current-user';
import { ScoredSection, overallScore, completionPct } from '../common/scoring';

type Ratings = Record<string, number>;
type Texts = Record<string, string>;

@Injectable()
export class AppraisalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  private templateInclude = {
    template: { include: { sections: { include: { fields: true }, orderBy: { order: 'asc' as const } } } },
    employee: true,
    manager: true,
    cycle: true,
    signatures: true,
  };

  private scoredSections(template: any): ScoredSection[] {
    return (template?.sections ?? []).map((s: any) => ({
      type: s.type,
      weight: s.weight,
      fieldIds: s.fields.map((f: any) => f.id),
    }));
  }

  async list(user: AuthUser) {
    const where = this.scope.appraisalWhere(user); // throws 403 for admin-only
    const rows = await this.prisma.appraisal.findMany({
      where,
      include: this.templateInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.withComputed(r));
  }

  async getOne(user: AuthUser, id: string) {
    const a = await this.prisma.appraisal.findUnique({ where: { id }, include: this.templateInclude });
    if (!a) throw new NotFoundException();
    const ok = this.scope.canView(user, {
      employeeId: a.employeeId,
      managerId: a.managerId,
      status: a.status,
      employeeOrg: a.employee?.org,
    });
    if (!ok) throw new ForbiddenException('Out of scope');
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'APPRAISAL.VIEW', objectRef: `appraisal:${id}` });
    return this.withComputed(a);
  }

  private withComputed(a: any) {
    const sections = this.scoredSections(a.template);
    const self = (a.employeeSelf ?? {}) as { ratings?: Ratings; texts?: Texts; goals?: any[] };
    const mgr = (a.managerReview ?? {}) as { ratings?: Ratings; sectionComments?: Record<string, string> };
    const employeeScore = a.employeeScore ?? overallScore(sections, self.ratings ?? {});
    const managerScore = a.managerScore ?? overallScore(sections, mgr.ratings ?? {});
    const complete = completionPct(sections, self.ratings ?? {}, self.texts ?? {});
    return { ...a, employeeScore, managerScore, completionPct: complete };
  }

  // ── Employee self-edit ────────────────────────────────────────────────
  async patchSelf(user: AuthUser, id: string, body: { ratings?: Ratings; texts?: Texts; goals?: any[] }) {
    const a = await this.prisma.appraisal.findUnique({ where: { id }, include: this.templateInclude });
    if (!a) throw new NotFoundException();
    if (!this.scope.canEditSelf(user, a)) throw new ForbiddenException('Cannot edit this appraisal');

    const prev = (a.employeeSelf ?? {}) as any;
    const next = {
      ratings: { ...(prev.ratings ?? {}), ...(body.ratings ?? {}) },
      texts: { ...(prev.texts ?? {}), ...(body.texts ?? {}) },
      goals: body.goals ?? prev.goals ?? [],
    };
    const sections = this.scoredSections(a.template);
    const employeeScore = overallScore(sections, next.ratings);
    const status = a.status === 'not_started' ? 'in_progress' : a.status;

    const updated = await this.prisma.appraisal.update({
      where: { id },
      data: { employeeSelf: next, employeeScore, status },
      include: this.templateInclude,
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'APPRAISAL.SAVE', objectRef: `appraisal:${id}` });
    return this.withComputed(updated);
  }

  // ── Submit for review ─────────────────────────────────────────────────
  async submit(user: AuthUser, id: string, ip?: string) {
    const a = await this.prisma.appraisal.findUnique({ where: { id }, include: this.templateInclude });
    if (!a) throw new NotFoundException();
    if (a.employeeId !== user.id) throw new ForbiddenException('Only the appraisee can submit');
    if (!['not_started', 'in_progress', 'changes_requested'].includes(a.status)) {
      throw new BadRequestException(`Cannot submit from status ${a.status}`);
    }
    const updated = await this.prisma.appraisal.update({
      where: { id },
      data: { status: 'submitted', submittedAt: new Date() },
      include: this.templateInclude,
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'APPRAISAL.SUBMIT', objectRef: `appraisal:${id}`, sourceIp: ip });
    if (a.manager) {
      await this.notify.onEmployeeSubmitted(a.manager.email, a.managerId, a.employee.displayName, id, user.id, user.displayName);
    }
    return this.withComputed(updated);
  }

  // ── Manager mirrored review ───────────────────────────────────────────
  async managerReview(user: AuthUser, id: string, body: { ratings?: Ratings; sectionComments?: Record<string, string> }, ip?: string) {
    const a = await this.prisma.appraisal.findUnique({ where: { id }, include: this.templateInclude });
    if (!a) throw new NotFoundException();
    if (!this.scope.isManagerOf(user, a)) throw new ForbiddenException('Not the responsible manager');
    if (a.status !== 'submitted') throw new BadRequestException('Appraisal is not awaiting review');

    // Require every competency (rating field) to be rated.
    const sections = this.scoredSections(a.template);
    const ratingFieldIds = sections.filter((s) => s.type === 'rating').flatMap((s) => s.fieldIds);
    const ratings = body.ratings ?? {};
    const missing = ratingFieldIds.filter((fid) => !(typeof ratings[fid] === 'number' && ratings[fid] > 0));
    if (missing.length > 0) throw new BadRequestException(`All competencies must be rated (${missing.length} missing)`);

    const managerScore = overallScore(sections, ratings);
    const updated = await this.prisma.appraisal.update({
      where: { id },
      data: {
        managerReview: { ratings, sectionComments: body.sectionComments ?? {} },
        managerScore,
        managerReviewDone: true,
      },
      include: this.templateInclude,
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'APPRAISAL.MANAGER_REVIEW', objectRef: `appraisal:${id}`, sourceIp: ip });
    return this.withComputed(updated);
  }

  // ── Decision ──────────────────────────────────────────────────────────
  async decision(user: AuthUser, id: string, action: 'approve' | 'request' | 'reject', comment: string, ip?: string) {
    const a = await this.prisma.appraisal.findUnique({ where: { id }, include: this.templateInclude });
    if (!a) throw new NotFoundException();
    if (!this.scope.isManagerOf(user, a)) throw new ForbiddenException('Not the responsible manager');
    if (!a.managerReviewDone) throw new BadRequestException('Complete the manager review first');

    let status = a.status;
    let auditAction = '';
    if (action === 'approve') { status = 'approved'; auditAction = 'APPRAISAL.APPROVE'; }
    else if (action === 'request') { status = 'changes_requested'; auditAction = 'APPRAISAL.REQUEST_CHANGES'; }
    else if (action === 'reject') { status = 'rejected'; auditAction = 'APPRAISAL.REJECT'; }
    else throw new BadRequestException('Unknown action');

    const updated = await this.prisma.appraisal.update({
      where: { id },
      data: { status, decidedAt: new Date(), finalCommentManager: comment || a.finalCommentManager },
      include: this.templateInclude,
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: auditAction, objectRef: `appraisal:${id}`, sourceIp: ip });

    if (action === 'approve') await this.notify.onApproved(a.employee.email, a.employeeId, id, user.id, user.displayName);
    if (action === 'request') await this.notify.onChangesRequested(a.employee.email, a.employeeId, id, comment, user.id, user.displayName);
    if (action === 'reject') await this.notify.onRejected(a.employee.email, a.employeeId, comment, user.id, user.displayName);

    return this.withComputed(updated);
  }

  // ── Dual e-signature ──────────────────────────────────────────────────
  async sign(user: AuthUser, id: string, party: 'employee' | 'manager', name: string, ip?: string) {
    const a = await this.prisma.appraisal.findUnique({ where: { id }, include: this.templateInclude });
    if (!a) throw new NotFoundException();
    if (a.status !== 'approved') throw new BadRequestException('Only approved appraisals can be signed');

    if (party === 'employee' && a.employeeId !== user.id) throw new ForbiddenException('Only the appraisee may sign as employee');
    if (party === 'manager' && !this.scope.isManagerOf(user, a)) throw new ForbiddenException('Only the manager may sign as manager');

    await this.prisma.signature.upsert({
      where: { appraisalId_party: { appraisalId: id, party } },
      update: { name, account: user.upn, ip, signedAt: new Date() },
      create: { appraisalId: id, party, name, account: user.upn, ip },
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'APPRAISAL.ESIGN', objectRef: `appraisal:${id}:${party}`, sourceIp: ip });

    const sigs = await this.prisma.signature.findMany({ where: { appraisalId: id } });
    const both = sigs.some((s) => s.party === 'employee') && sigs.some((s) => s.party === 'manager');
    if (both && !a.signed) {
      await this.prisma.appraisal.update({ where: { id }, data: { signed: true } });
      await this.notify.onFinalized(a.employee.email, a.employeeId, id, user.id, user.displayName);
    }
    return this.getOne(user, id);
  }

  // ── Create / assign ───────────────────────────────────────────────────
  async assign(user: AuthUser, employeeId: string, templateId: string, cycleId?: string) {
    // Managers assign for their reports; execs can assign within scope.
    const employee = await this.prisma.user.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const isManager = user.roles.includes('it_manager') && employee.managerId === user.id;
    const isExec = user.roles.some((r) => ['cto', 'cio', 'md'].includes(r));
    if (!isManager && !isExec) throw new ForbiddenException('Cannot assign appraisals to this employee');

    const created = await this.prisma.appraisal.create({
      data: {
        employeeId,
        managerId: employee.managerId,
        templateId,
        cycleId: cycleId ?? null,
        status: 'not_started',
      },
      include: this.templateInclude,
    });
    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'APPRAISAL.SAVE', objectRef: `appraisal:${created.id}` });
    return this.withComputed(created);
  }
}
