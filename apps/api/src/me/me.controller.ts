import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from '../auth/current-user';
import { navForRoles } from './nav';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    return {
      id: user.id,
      upn: user.upn,
      email: user.email,
      displayName: user.displayName,
      department: user.department,
      org: user.org,
      roles: user.roles,
      appRoles: user.appRoles,
      nav: navForRoles(user.roles),
    };
  }

  /** Users the caller may pick for assignment / cycle participants. */
  @Get('team')
  async team(@CurrentUser() user: AuthUser) {
    if (user.roles.some((r) => ['cto', 'cio', 'md'].includes(r))) {
      const where = user.roles.includes('md') ? {} : { org: 'IT' };
      return this.prisma.user.findMany({ where, select: { id: true, displayName: true, department: true, org: true, managerId: true }, orderBy: { displayName: 'asc' } });
    }
    if (user.roles.includes('it_manager')) {
      return this.prisma.user.findMany({ where: { managerId: user.id }, select: { id: true, displayName: true, department: true, org: true, managerId: true }, orderBy: { displayName: 'asc' } });
    }
    return [];
  }
}
