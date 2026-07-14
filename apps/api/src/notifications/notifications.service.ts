import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService } from '../graph/graph.service';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { EmailContent, NotificationKind, renderEmailHtml } from './email-templates';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private webOrigin(): string {
    return this.config.get<AppConfig>('app')!.webOrigin;
  }

  /** Send an email, log it to the notification table and audit it. */
  async send(params: {
    kind: NotificationKind;
    toUserId?: string | null;
    toEmail: string;
    content: EmailContent;
    actorId?: string | null;
    actorName?: string | null;
  }) {
    const { kind, toUserId, toEmail, content, actorId, actorName } = params;
    let graphMessageId: string | null = null;
    let result = 'success';
    try {
      graphMessageId = await this.graph.sendMail(toEmail, content.subject, renderEmailHtml(content));
    } catch (e: any) {
      result = 'failed';
      this.logger.error(`sendMail failed to ${toEmail}: ${e.message}`);
    }

    const notif = await this.prisma.notification.create({
      data: {
        kind,
        subject: content.subject,
        body: content.bodyText,
        preview: content.bodyText.slice(0, 140),
        toUserId: toUserId ?? undefined,
        toEmail,
        graphMessageId: graphMessageId ?? undefined,
      },
    });

    await this.audit.append({
      actorId: actorId ?? null,
      actorName: actorName ?? 'system',
      action: 'GRAPH.MAIL_SEND',
      objectRef: `notification:${notif.id}`,
      result,
    });

    return notif;
  }

  private cta(path: string): string {
    return `${this.webOrigin()}${path}`;
  }

  // ── Transition helpers (§8) ─────────────────────────────────────────────
  async onEmployeeSubmitted(managerEmail: string, managerId: string | null, employeeName: string, appraisalId: string, actorId?: string, actorName?: string) {
    return this.send({
      kind: 'submitted', toUserId: managerId, toEmail: managerEmail, actorId, actorName,
      content: {
        subject: 'Appraisal submitted for your review',
        bodyText: `${employeeName} has submitted their self-assessment. Please complete your manager review.`,
        ctaLabel: 'Open review', ctaUrl: this.cta(`/reviews/${appraisalId}`),
      },
    });
  }

  async onChangesRequested(employeeEmail: string, employeeId: string, appraisalId: string, comment: string, actorId?: string, actorName?: string) {
    return this.send({
      kind: 'changes', toUserId: employeeId, toEmail: employeeEmail, actorId, actorName,
      content: {
        subject: 'Changes requested on your appraisal',
        bodyText: `Your manager has requested changes: ${comment || 'Please review the comments and resubmit.'}`,
        ctaLabel: 'Edit appraisal', ctaUrl: this.cta(`/my-appraisal`),
      },
    });
  }

  async onRejected(employeeEmail: string, employeeId: string, comment: string, actorId?: string, actorName?: string) {
    return this.send({
      kind: 'rejected', toUserId: employeeId, toEmail: employeeEmail, actorId, actorName,
      content: {
        subject: 'Your appraisal was not approved',
        bodyText: `Your appraisal was not approved. ${comment || 'Please contact your manager for details.'}`,
        ctaLabel: 'Contact manager', ctaUrl: this.cta(`/my-appraisal`),
      },
    });
  }

  async onApproved(employeeEmail: string, employeeId: string, appraisalId: string, actorId?: string, actorName?: string) {
    return this.send({
      kind: 'approved', toUserId: employeeId, toEmail: employeeEmail, actorId, actorName,
      content: {
        subject: 'Appraisal approved — signatures required',
        bodyText: 'Your appraisal has been approved. Both you and your manager must electronically sign to finalize it.',
        ctaLabel: 'Sign', ctaUrl: this.cta(`/my-appraisal`),
      },
    });
  }

  async onFinalized(employeeEmail: string, employeeId: string, appraisalId: string, actorId?: string, actorName?: string) {
    return this.send({
      kind: 'approved', toUserId: employeeId, toEmail: employeeEmail, actorId, actorName,
      content: {
        subject: 'Appraisal finalized & signed',
        bodyText: 'Your appraisal is now finalized and signed by both parties. It is locked and stored securely.',
        ctaLabel: 'View appraisal', ctaUrl: this.cta(`/my-appraisal`),
      },
    });
  }

  async onDeadlineExtended(email: string, userId: string | null, newDate: string, actorId?: string, actorName?: string) {
    return this.send({
      kind: 'reminder', toUserId: userId, toEmail: email, actorId, actorName,
      content: {
        subject: 'Target date extended',
        bodyText: `Your appraisal target date has been extended to ${newDate}.`,
        ctaLabel: 'Complete now', ctaUrl: this.cta(`/my-appraisal`),
      },
    });
  }

  async onReminder(email: string, userId: string | null, daysLeft: number, actorName = 'system') {
    return this.send({
      kind: 'reminder', toUserId: userId, toEmail: email, actorName,
      content: {
        subject: `Reminder: appraisal action due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        bodyText: `You have an outstanding appraisal action due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Please complete it in time.`,
        ctaLabel: 'Complete now', ctaUrl: this.cta(`/dashboard`),
      },
    });
  }
}
