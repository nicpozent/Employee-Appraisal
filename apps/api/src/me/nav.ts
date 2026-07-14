import { Role, CAN_BE_APPRAISEE } from '../auth/roles';

export interface NavItem { key: string; label: string; roles: Role[] | 'all' }

/* Left-rail nav per role (§3). */
export const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', roles: 'all' },
  { key: 'my-appraisal', label: 'My appraisal', roles: CAN_BE_APPRAISEE },
  { key: 'reviews', label: 'Team reviews', roles: ['it_manager', 'cto', 'cio'] },
  { key: 'organization', label: 'Organization', roles: ['cto', 'cio', 'md', 'cfo'] }, // cfo relabels to "Finished appraisals"
  { key: 'analytics', label: 'Analytics', roles: ['cto', 'cio', 'md', 'cfo'] },
  { key: 'templates', label: 'Templates', roles: ['admin', 'it_manager', 'cto', 'cio'] },
  { key: 'cycles', label: 'Cycles & dates', roles: ['admin', 'it_manager', 'cto', 'cio'] },
  { key: 'users', label: 'Users & roles', roles: ['admin'] },
  { key: 'security', label: 'Security & compliance', roles: ['admin', 'cio'] },
  { key: 'audit', label: 'Audit log', roles: ['admin', 'cio'] },
  { key: 'gdpr', label: 'Data & GDPR', roles: ['admin', 'cio'] },
  { key: 'notifications', label: 'Notifications', roles: 'all' },
];

export function navForRoles(roles: Role[]): { key: string; label: string }[] {
  return NAV.filter((n) => n.roles === 'all' || n.roles.some((r) => roles.includes(r))).map((n) => {
    // cfo sees "Organization" relabeled to "Finished appraisals"
    if (n.key === 'organization' && roles.includes('cfo') && !roles.some((r) => ['cto', 'cio', 'md'].includes(r))) {
      return { key: n.key, label: 'Finished appraisals' };
    }
    return { key: n.key, label: n.label };
  });
}
