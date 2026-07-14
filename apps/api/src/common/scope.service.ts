import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/current-user';

/* Per-request scope resolution (§3). Builds a Prisma `where` that limits
   appraisals to what the caller may see. Admin gets nothing (403). */
@Injectable()
export class ScopeService {
  /** Throws if the user has no appraisal-content scope at all (admin-only). */
  appraisalWhere(user: AuthUser): Prisma.AppraisalWhereInput {
    const ors: Prisma.AppraisalWhereInput[] = [];

    for (const role of user.roles) {
      switch (role) {
        case 'appraisee':
          ors.push({ employeeId: user.id });
          break;
        case 'it_manager':
          ors.push({ employee: { managerId: user.id } });
          break;
        case 'cto':
        case 'cio':
          ors.push({ employee: { org: 'IT' } });
          break;
        case 'cfo':
          ors.push({ status: 'approved' });
          break;
        case 'md':
          ors.push({}); // all
          break;
        case 'admin':
          break; // no appraisal scope
      }
    }

    if (ors.length === 0) {
      throw new ForbiddenException('No appraisal scope for this role');
    }
    // If any role grants "all" (md), collapse to unrestricted.
    if (ors.some((o) => Object.keys(o).length === 0)) return {};
    return { OR: ors };
  }

  /** Whether the user may see a specific appraisal record. */
  canView(user: AuthUser, appraisal: { employeeId: string; managerId?: string | null; status: string; employeeOrg?: string | null }): boolean {
    for (const role of user.roles) {
      if (role === 'md') return true;
      if (role === 'appraisee' && appraisal.employeeId === user.id) return true;
      if (role === 'it_manager' && appraisal.managerId === user.id) return true;
      if ((role === 'cto' || role === 'cio') && appraisal.employeeOrg === 'IT') return true;
      if (role === 'cfo' && appraisal.status === 'approved') return true;
    }
    return false;
  }

  /** Whether the user may edit the employee-side (self-assessment) of this appraisal. */
  canEditSelf(user: AuthUser, appraisal: { employeeId: string; status: string }): boolean {
    return (
      appraisal.employeeId === user.id &&
      ['not_started', 'in_progress', 'changes_requested'].includes(appraisal.status)
    );
  }

  /** Whether the user is the responsible manager for this appraisal. */
  isManagerOf(user: AuthUser, appraisal: { managerId?: string | null }): boolean {
    return !!appraisal.managerId && appraisal.managerId === user.id && user.roles.includes('it_manager');
  }
}
