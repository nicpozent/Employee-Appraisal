import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { CurrentUser, AuthUser } from '../auth/current-user';
import { Roles, NoAdmin } from '../auth/roles.decorator';

/* Analytics (§5.11) — cto, cio, md, cfo. Never admin (no appraisal content). */
@Controller('analytics')
@Roles('cto', 'cio', 'md', 'cfo')
@NoAdmin()
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService) {}

  @Get()
  async analytics(@CurrentUser() user: AuthUser) {
    const where = this.scope.appraisalWhere(user);
    const rows = await this.prisma.appraisal.findMany({ where, include: { employee: true } });

    // Average manager score by department
    const byDept: Record<string, { sum: number; n: number }> = {};
    const byStatus: Record<string, number> = {};
    const distribution: Record<string, number> = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };

    for (const a of rows) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      const dept = a.employee?.department ?? 'Unknown';
      const score = a.managerScore ?? 0;
      if (a.managerScore != null) {
        byDept[dept] = byDept[dept] ?? { sum: 0, n: 0 };
        byDept[dept].sum += score; byDept[dept].n += 1;
        const bucket = score <= 20 ? '0-20' : score <= 40 ? '21-40' : score <= 60 ? '41-60' : score <= 80 ? '61-80' : '81-100';
        distribution[bucket]++;
      }
    }

    return {
      total: rows.length,
      avgScoreByDepartment: Object.entries(byDept).map(([dept, v]) => ({ dept, avg: Math.round(v.sum / v.n) })),
      completionByStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      distribution: Object.entries(distribution).map(([bucket, count]) => ({ bucket, count })),
    };
  }
}
