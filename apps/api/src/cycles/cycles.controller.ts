import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CyclesService } from './cycles.service';
import { CurrentUser, AuthUser } from '../auth/current-user';
import { Roles } from '../auth/roles.decorator';

/* Cycles & target dates (§5.8) — admin, manager, cto, cio. */
@Controller('cycles')
@Roles('admin', 'it_manager', 'cto', 'cio')
export class CyclesController {
  constructor(private readonly svc: CyclesService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.svc.create(user, dto);
  }

  @Post(':id/extend')
  extend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { scope: 'cycle' | 'user'; userId?: string; days: number }) {
    return this.svc.extend(user, id, body.scope, body.days, body.userId);
  }
}
