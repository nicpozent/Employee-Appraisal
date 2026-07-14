import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GraphService, DEFAULT_GROUP_ROLE_MAP } from '../graph/graph.service';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { AuthUser } from '../auth/current-user';
import { mapEntraRoles } from '../auth/roles';

export interface ImportResult {
  live: boolean;
  groups: { groupId: string; groupName: string; role: string; imported: number }[];
  created: number;
  updated: number;
  total: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private cfg(): AppConfig {
    return this.config.get<AppConfig>('app')!;
  }

  async directory() {
    const users = await this.prisma.user.findMany({
      include: { manager: { select: { displayName: true } } },
      orderBy: { displayName: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      upn: u.upn,
      department: u.department,
      org: u.org,
      managerName: u.manager?.displayName ?? null,
      appRoles: u.appRoles,
      roles: mapEntraRoles(u.appRoles),
      entraGroups: u.entraGroups,
      mfaEnabled: u.mfaEnabled,
      lastSignIn: u.lastSignIn,
      entraObjectId: u.entraObjectId,
    }));
  }

  importConfig() {
    const c = this.cfg();
    return {
      live: this.graph.isLive,
      authMode: c.authMode,
      tenantId: c.entra.tenantId || null,
      clientId: c.entra.clientId || null,
      configuredGroupIds: c.graph.importGroupIds,
      defaultGroupRoleMap: DEFAULT_GROUP_ROLE_MAP,
      graphScopes: ['User.Read.All', 'GroupMember.Read.All', 'Directory.Read.All', 'Mail.Send'],
    };
  }

  /** Import users from Entra security groups; derive appRoles from group→role map. */
  async importFromGroups(actor: AuthUser, groupIds?: string[], groupRoleMap?: Record<string, string>): Promise<ImportResult> {
    const c = this.cfg();
    const groups = (groupIds?.length ? groupIds : c.graph.importGroupIds);
    const roleMap = { ...DEFAULT_GROUP_ROLE_MAP, ...(groupRoleMap ?? {}) };

    if (!this.graph.isLive) {
      // Dev-mock: simulate an import so the admin flow is demonstrable without a tenant.
      const result = await this.simulateImport(roleMap);
      await this.audit.append({ actorId: actor.id, actorName: actor.displayName, action: 'AUTH.SIGN_IN', objectRef: `import:simulated`, result: 'success' });
      return result;
    }

    let created = 0, updated = 0;
    const perGroup: ImportResult['groups'] = [];
    // Accumulate roles/groups per user across all groups before writing.
    const acc = new Map<string, { member: any; roles: Set<string>; groups: Set<string> }>();

    for (const gid of groups) {
      const [members, groupName] = await Promise.all([
        this.graph.getGroupMembers(gid),
        this.graph.getGroupName(gid).catch(() => gid),
      ]);
      const role = roleMap[gid] || roleMap[groupName] || '';
      perGroup.push({ groupId: gid, groupName, role, imported: members.length });
      for (const m of members) {
        const cur = acc.get(m.upn) ?? { member: m, roles: new Set<string>(), groups: new Set<string>() };
        if (role) cur.roles.add(role);
        cur.groups.add(groupName);
        acc.set(m.upn, cur);
      }
    }

    for (const [upn, entry] of acc) {
      const existing = await this.prisma.user.findUnique({ where: { upn } });
      const data = {
        entraObjectId: entry.member.entraObjectId,
        email: entry.member.email,
        displayName: entry.member.displayName,
        department: entry.member.department,
        appRoles: Array.from(entry.roles),
        entraGroups: Array.from(entry.groups),
      };
      if (existing) {
        await this.prisma.user.update({ where: { upn }, data });
        updated++;
      } else {
        await this.prisma.user.create({ data: { upn, ...data } });
        created++;
      }
    }

    await this.audit.append({ actorId: actor.id, actorName: actor.displayName, action: 'AUTH.SIGN_IN', objectRef: `import:groups:${groups.join(',')}`, result: 'success' });
    return { live: true, groups: perGroup, created, updated, total: acc.size };
  }

  /** Adjust a user's appRoles (admin only). */
  async setRoles(actor: AuthUser, id: string, appRoles: string[]) {
    const u = await this.prisma.user.update({ where: { id }, data: { appRoles } });
    await this.audit.append({ actorId: actor.id, actorName: actor.displayName, action: 'TEMPLATE.UPDATE', objectRef: `user:${id}:roles` });
    return u;
  }

  // ── Dev-mock simulated import ─────────────────────────────────────────
  private async simulateImport(roleMap: Record<string, string>): Promise<ImportResult> {
    const sample = [
      { upn: 'lars.svensson@birgma.com', displayName: 'Lars Svensson', department: 'IT — Data', group: 'SG-Appraisal-Employees' },
      { upn: 'mona.karlsson@birgma.com', displayName: 'Mona Karlsson', department: 'IT — Infrastructure', group: 'SG-Appraisal-Employees' },
      { upn: 'peter.ek@birgma.com', displayName: 'Peter Ek', department: 'Finance — Trade', group: 'SG-Appraisal-Employees' },
    ];
    let created = 0, updated = 0;
    const groupCounts: Record<string, number> = {};
    for (const s of sample) {
      const role = roleMap[s.group] || 'Appraisal.Employee';
      groupCounts[s.group] = (groupCounts[s.group] ?? 0) + 1;
      const existing = await this.prisma.user.findUnique({ where: { upn: s.upn } });
      const data = { email: s.upn, displayName: s.displayName, department: s.department, org: s.department.startsWith('IT') ? 'IT' : 'Finance', appRoles: [role], entraGroups: [s.group] };
      if (existing) { await this.prisma.user.update({ where: { upn: s.upn }, data }); updated++; }
      else { await this.prisma.user.create({ data: { upn: s.upn, ...data } }); created++; }
    }
    const groups = Object.entries(groupCounts).map(([g, n]) => ({ groupId: g, groupName: g, role: roleMap[g] || 'Appraisal.Employee', imported: n }));
    return { live: false, groups, created, updated, total: sample.length };
  }
}
