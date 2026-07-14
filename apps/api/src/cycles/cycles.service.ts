import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/current-user';

interface CreateCycleDto {
  name: string;
  scope: string;
  targetDate: string;
  steps: { label: string; dueDate: string }[];
  participants: { userId: string; dueDate?: string; team?: string }[];
  templateId?: string; // if provided, generate appraisals for participants
}

@Injectable()
export class CyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  private include = { steps: { orderBy: { order: 'asc' as const } }, participants: true };

  list() {
    return this.prisma.cycle.findMany({ include: this.include, orderBy: { createdAt: 'desc' } });
  }

  async getOne(id: string) {
    const c = await this.prisma.cycle.findUnique({ where: { id }, include: this.include });
    if (!c) throw new NotFoundException();
    return c;
  }

  async create(user: AuthUser, dto: CreateCycleDto) {
    const cycle = await this.prisma.cycle.create({
      data: {
        name: dto.name,
        scope: dto.scope,
        status: 'active',
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        steps: { create: (dto.steps ?? []).map((s, i) => ({ label: s.label, dueDate: s.dueDate ? new Date(s.dueDate) : null, order: i, state: i === 0 ? 'in_progress' : 'upcoming' })) },
        participants: { create: (dto.participants ?? []).map((p) => ({ userId: p.userId, team: p.team, dueDate: p.dueDate ? new Date(p.dueDate) : (dto.targetDate ? new Date(dto.targetDate) : null) })) },
      },
      include: this.include,
    });

    // Optionally generate appraisals for each participant.
    if (dto.templateId) {
      for (const p of dto.participants ?? []) {
        const employee = await this.prisma.user.findUnique({ where: { id: p.userId } });
        if (!employee) continue;
        const exists = await this.prisma.appraisal.findFirst({ where: { employeeId: p.userId, cycleId: cycle.id } });
        if (exists) continue;
        await this.prisma.appraisal.create({
          data: { employeeId: p.userId, managerId: employee.managerId, templateId: dto.templateId, cycleId: cycle.id, status: 'not_started' },
        });
      }
    }

    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'CYCLE.EXTEND_DATE', objectRef: `cycle:${cycle.id}:create` });
    return cycle;
  }

  /* Extend flow (§5.8). Whole-cycle shifts everything; single-user shifts one participant. */
  async extend(user: AuthUser, id: string, scope: 'cycle' | 'user', days: number, userId?: string) {
    if (![7, 14, 30].includes(days)) throw new BadRequestException('days must be 7, 14 or 30');
    const cycle = await this.prisma.cycle.findUnique({ where: { id }, include: this.include });
    if (!cycle) throw new NotFoundException();
    const shift = (d: Date | null) => (d ? new Date(d.getTime() + days * 86400000) : d);

    if (scope === 'cycle') {
      await this.prisma.cycle.update({ where: { id }, data: { targetDate: shift(cycle.targetDate) } });
      for (const s of cycle.steps) await this.prisma.cycleStep.update({ where: { id: s.id }, data: { dueDate: shift(s.dueDate) } });
      for (const p of cycle.participants) {
        await this.prisma.cycleParticipant.update({ where: { id: p.id }, data: { dueDate: shift(p.dueDate) } });
        const u = await this.prisma.user.findUnique({ where: { id: p.userId } });
        if (u) await this.notify.onDeadlineExtended(u.email, u.id, this.fmt(shift(p.dueDate)), user.id, user.displayName);
      }
    } else {
      if (!userId) throw new BadRequestException('userId required for user-scope extension');
      const p = cycle.participants.find((x) => x.userId === userId);
      if (!p) throw new NotFoundException('Participant not in cycle');
      await this.prisma.cycleParticipant.update({ where: { id: p.id }, data: { dueDate: shift(p.dueDate), extended: true } });
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (u) await this.notify.onDeadlineExtended(u.email, u.id, this.fmt(shift(p.dueDate)), user.id, user.displayName);
    }

    await this.audit.append({ actorId: user.id, actorName: user.displayName, action: 'CYCLE.EXTEND_DATE', objectRef: `cycle:${id}:${scope}:${userId ?? 'all'}:+${days}d` });
    return this.getOne(id);
  }

  private fmt(d: Date | null): string {
    if (!d) return '—';
    return d.toISOString().slice(0, 10);
  }
}
