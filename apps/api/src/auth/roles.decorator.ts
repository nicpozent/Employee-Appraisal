import { SetMetadata } from '@nestjs/common';
import { Role } from './roles';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Marks appraisal-content endpoints that the Platform Admin must never reach (§3). */
export const NO_ADMIN_KEY = 'noAdmin';
export const NoAdmin = () => SetMetadata(NO_ADMIN_KEY, true);

/** Marks a route as public (no auth). */
export const PUBLIC_KEY = 'public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
