import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { Roles } from '../auth/roles.decorator';

/* Audit log screen (§5.13) — admin & cio only. */
@Controller('audit')
@Roles('admin', 'cio')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query('take') take = '200') {
    const rows = await this.prisma.auditEvent.findMany({
      orderBy: { ts: 'desc' },
      take: Math.min(parseInt(take, 10) || 200, 1000),
    });
    return rows;
  }

  @Get('verify')
  verify() {
    return this.audit.verifyChain();
  }
}
