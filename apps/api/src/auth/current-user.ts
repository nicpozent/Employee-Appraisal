import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from './roles';

export interface AuthUser {
  id: string; // internal User.id
  entraObjectId?: string | null;
  upn: string;
  email: string;
  displayName: string;
  org?: string | null;
  department?: string | null;
  managerId?: string | null;
  roles: Role[];
  appRoles: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser;
  },
);
