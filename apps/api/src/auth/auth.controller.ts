import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { Public } from './roles.decorator';
import { mapEntraRoles } from './roles';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private cfg() {
    return this.config.get<AppConfig>('app')!;
  }

  /** Public config the SPA needs to decide how to sign in. */
  @Public()
  @Get('config')
  getConfig() {
    const c = this.cfg();
    return {
      authMode: c.authMode,
      entra: c.authMode === 'entra'
        ? { tenantId: c.entra.tenantId, clientId: c.entra.clientId, apiAudience: c.entra.apiAudience }
        : null,
    };
  }

  /** Dev-only: list selectable identities for the mock role switcher. */
  @Public()
  @Get('dev-users')
  async devUsers() {
    if (this.cfg().authMode !== 'mock') return [];
    const users = await this.prisma.user.findMany({ orderBy: { displayName: 'asc' } });
    return users.map((u) => ({
      upn: u.upn,
      displayName: u.displayName,
      department: u.department,
      roles: mapEntraRoles(u.appRoles),
    }));
  }
}
