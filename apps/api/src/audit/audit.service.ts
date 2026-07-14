import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  objectRef?: string | null;
  sourceIp?: string | null;
  result?: string;
}

/* Append-only, tamper-evident audit log (§9, §10). Each row's hash chains
   the previous row's hash so any edit/deletion breaks the chain. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AuditInput) {
    const last = await this.prisma.auditEvent.findFirst({ orderBy: { ts: 'desc' } });
    const prevHash = last?.hash ?? null;
    const ts = new Date();
    const payload = JSON.stringify({
      ts: ts.toISOString(),
      actorId: input.actorId ?? null,
      action: input.action,
      objectRef: input.objectRef ?? null,
      sourceIp: input.sourceIp ?? null,
      result: input.result ?? 'success',
      prevHash,
    });
    const hash = createHash('sha256').update(payload).digest('hex');

    return this.prisma.auditEvent.create({
      data: {
        ts,
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        action: input.action,
        objectRef: input.objectRef ?? null,
        sourceIp: input.sourceIp ?? null,
        result: input.result ?? 'success',
        prevHash,
        hash,
      },
    });
  }

  /** Verify the whole chain is intact (used by the Security screen). */
  async verifyChain(): Promise<{ ok: boolean; brokenAt?: string; count: number }> {
    const rows = await this.prisma.auditEvent.findMany({ orderBy: { ts: 'asc' } });
    let prevHash: string | null = null;
    for (const r of rows) {
      const payload = JSON.stringify({
        ts: r.ts.toISOString(),
        actorId: r.actorId,
        action: r.action,
        objectRef: r.objectRef,
        sourceIp: r.sourceIp,
        result: r.result,
        prevHash,
      });
      const expected = createHash('sha256').update(payload).digest('hex');
      if (expected !== r.hash || r.prevHash !== prevHash) {
        return { ok: false, brokenAt: r.id, count: rows.length };
      }
      prevHash = r.hash;
    }
    return { ok: true, count: rows.length };
  }
}
