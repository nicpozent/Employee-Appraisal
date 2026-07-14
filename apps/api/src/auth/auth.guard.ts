import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { NO_ADMIN_KEY, PUBLIC_KEY, ROLES_KEY } from './roles.decorator';
import { Role, isAdminOnly } from './roles';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = await this.auth.resolve(req);
    req.user = user;

    // Admin-blindness: appraisal-content routes are hard-blocked for admin-only users (§3).
    const noAdmin = this.reflector.getAllAndOverride<boolean>(NO_ADMIN_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (noAdmin && isAdminOnly(user.roles)) {
      throw new ForbiddenException('Platform Administrators cannot access appraisal content');
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      const ok = user.roles.some((r) => requiredRoles.includes(r));
      if (!ok) throw new ForbiddenException('Insufficient role for this resource');
    }

    if (!user) throw new UnauthorizedException();
    return true;
  }
}
