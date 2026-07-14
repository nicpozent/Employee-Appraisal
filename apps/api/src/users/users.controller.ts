import { Body, Controller, Get, Param, Post, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, AuthUser } from '../auth/current-user';
import { Roles } from '../auth/roles.decorator';

/* Users & roles / Enterprise Application (§5.15) — admin only. */
@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  directory() {
    return this.svc.directory();
  }

  @Get('import/config')
  importConfig() {
    return this.svc.importConfig();
  }

  @Post('import')
  import(@CurrentUser() user: AuthUser, @Body() body: { groupIds?: string[]; groupRoleMap?: Record<string, string> }) {
    return this.svc.importFromGroups(user, body?.groupIds, body?.groupRoleMap);
  }

  @Patch(':id/roles')
  setRoles(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { appRoles: string[] }) {
    return this.svc.setRoles(user, id, body.appRoles);
  }
}
