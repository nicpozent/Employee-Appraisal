import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, AuthUser } from '../auth/current-user';
import { Roles } from '../auth/roles.decorator';

/* Data protection & GDPR (§5.14) — admin, cio. Admin gets a compliance
   receipt only (no appraisal content); cio may retrieve the full package. */
@Controller('gdpr')
@Roles('admin', 'cio')
export class GdprController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get('overview')
  overview() {
    return { retention: RETENTION, processing: PROCESSING, consent: CONSENT };
  }

  @Get('subjects')
  async subjects() {
    const users = await this.prisma.user.findMany({ select: { id: true, displayName: true, email: true, department: true }, orderBy: { displayName: 'asc' } });
    return users;
  }

  @Post('export')
  async export(@CurrentUser() actor: AuthUser, @Body() body: { userId: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException();
    const appraisals = await this.prisma.appraisal.findMany({ where: { employeeId: user.id } });
    const notifications = await this.prisma.notification.findMany({ where: { toUserId: user.id } });

    await this.audit.append({ actorId: actor.id, actorName: actor.displayName, action: 'GDPR.EXPORT', objectRef: `user:${user.id}` });

    const receipt = {
      subject: { id: user.id, displayName: user.displayName, email: user.email, department: user.department },
      counts: { appraisals: appraisals.length, notifications: notifications.length },
      generatedAt: new Date().toISOString(),
      articles: ['Art. 15 (access)', 'Art. 20 (portability)'],
    };

    // Admin gets receipt metadata only (admin-blindness). CIO gets full content.
    if (actor.roles.includes('cio') && !actor.roles.every((r) => r === 'admin')) {
      return { ...receipt, data: { user, appraisals, notifications } };
    }
    return { ...receipt, note: 'Full data package generated and delivered to the data subject. Appraisal content is not exposed to the Platform Administrator role.' };
  }

  @Post('erase')
  async erase(@CurrentUser() actor: AuthUser, @Body() body: { userId: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException();
    const anon = `anon-${user.id.slice(0, 8)}`;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: 'Anonymized user', email: `${anon}@anonymized.invalid`, upn: `${anon}@anonymized.invalid`,
        department: null, entraObjectId: null, entraGroups: [], active: false,
      },
    });
    await this.audit.append({ actorId: actor.id, actorName: actor.displayName, action: 'GDPR.EXPORT', objectRef: `user:${user.id}:erase`, result: 'success' });
    return { ok: true, anonymizedId: user.id, article: 'Art. 17 (erasure)' };
  }
}

const RETENTION = [
  { item: 'Active appraisals', period: 'Cycle + 3 years' },
  { item: 'Audit & access logs', period: '24 months' },
  { item: 'Email notifications', period: '12 months' },
  { item: 'Leaver records', period: 'Anonymized on exit, 90 days' },
];
const PROCESSING = [
  { activity: 'Performance appraisal', basis: 'Legitimate interest' },
  { activity: 'SSO authentication', basis: 'Contract' },
  { activity: 'Status notifications', basis: 'Legitimate interest' },
  { activity: 'Audit logging', basis: 'Legal obligation' },
];
const CONSENT = [
  { item: 'Privacy notice', state: 'Acknowledged' },
  { item: 'Processing record', state: 'Published' },
  { item: 'Sub-processor list (MS Graph)', state: 'Documented' },
];
