/* Role model (§3). Internal role keys are derived from Entra appRole values. */

export type Role =
  | 'appraisee'
  | 'it_manager' // display label "Manager"
  | 'cto'
  | 'cio'
  | 'cfo'
  | 'md'
  | 'admin';

export const ENTRA_ROLE_MAP: Record<string, Role> = {
  'Appraisal.Employee': 'appraisee',
  'Appraisal.Manager.IT': 'it_manager',
  'Appraisal.Exec.CTO': 'cto',
  'Appraisal.Exec.CIO': 'cio',
  'Appraisal.Exec.CFO': 'cfo',
  'Appraisal.Exec.MD': 'md',
  'Appraisal.Admin': 'admin',
};

export function mapEntraRoles(appRoles: string[] = []): Role[] {
  const roles = appRoles.map((r) => ENTRA_ROLE_MAP[r]).filter(Boolean) as Role[];
  return Array.from(new Set(roles));
}

/** Roles that may also be an appraisee (see nav "My appraisal" in §3). */
export const CAN_BE_APPRAISEE: Role[] = ['appraisee', 'it_manager', 'cto', 'cio'];

/** The admin must never read appraisal content (§3 critical rule). */
export function isAdminOnly(roles: Role[]): boolean {
  return roles.includes('admin') && !roles.some((r) => r !== 'admin');
}
