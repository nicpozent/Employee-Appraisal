import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppConfig } from '../config/configuration';

/* Scheduled reminder sweep (§8). Emails users & managers who have an
   outstanding appraisal action (self-assessment, review/approval, signature). */
@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationsService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  private cfg(): AppConfig {
    return this.config.get<AppConfig>('app')!;
  }

  onModuleInit() {
    const { enabled, cron } = this.cfg().reminders;
    if (!enabled) {
      this.logger.log('Reminders disabled (REMINDERS_ENABLED=false)');
      return;
    }
    const job = new CronJob(cron, () => {
      this.runSweep().catch((e) => this.logger.error(e));
    });
    this.scheduler.addCronJob('reminder-sweep', job as any);
    job.start();
    this.logger.log(`Reminder sweep scheduled: "${cron}"`);
  }

  /** Runs the reminder sweep. Returns a summary (also callable on demand). */
  async runSweep(): Promise<{ sent: number; breakdown: Record<string, number> }> {
    const leadDays = this.cfg().reminders.leadDays;
    const now = Date.now();
    const breakdown: Record<string, number> = { self_assessment: 0, manager_review: 0, signature: 0, changes_requested: 0 };

    const appraisals = await this.prisma.appraisal.findMany({
      include: { employee: true, manager: true, cycle: { include: { participants: true } }, signatures: true },
    });

    for (const a of appraisals) {
      if (a.signed) continue;
      const dueDate = this.participantDue(a) ?? a.cycle?.targetDate ?? null;
      const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - now) / 86400000) : leadDays;
      const withinLead = daysLeft <= leadDays;

      // 1) Employee needs to complete/resubmit self-assessment.
      if (['not_started', 'in_progress'].includes(a.status) && withinLead && a.employee) {
        await this.notify.onReminder(a.employee.email, a.employeeId, Math.max(daysLeft, 0));
        breakdown.self_assessment++;
      } else if (a.status === 'changes_requested' && a.employee) {
        await this.notify.onReminder(a.employee.email, a.employeeId, Math.max(daysLeft, 0));
        breakdown.changes_requested++;
      }

      // 2) Manager has a pending review/approval.
      if (a.status === 'submitted' && a.manager) {
        await this.notify.onReminder(a.manager.email, a.managerId, Math.max(daysLeft, 0));
        breakdown.manager_review++;
      }

      // 3) Approved but awaiting signatures — remind whoever hasn't signed.
      if (a.status === 'approved' && !a.signed) {
        const signed = new Set(a.signatures.map((s) => s.party));
        if (!signed.has('employee') && a.employee) { await this.notify.onReminder(a.employee.email, a.employeeId, Math.max(daysLeft, 0)); breakdown.signature++; }
        if (!signed.has('manager') && a.manager) { await this.notify.onReminder(a.manager.email, a.managerId, Math.max(daysLeft, 0)); breakdown.signature++; }
      }
    }

    const sent = Object.values(breakdown).reduce((a, b) => a + b, 0);
    this.logger.log(`Reminder sweep complete: ${sent} reminder(s) sent`);
    return { sent, breakdown };
  }

  private participantDue(a: any): Date | null {
    const p = a.cycle?.participants?.find((x: any) => x.userId === a.employeeId);
    return p?.dueDate ?? null;
  }
}
