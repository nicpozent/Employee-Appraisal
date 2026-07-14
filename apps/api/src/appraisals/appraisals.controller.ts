import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AppraisalsService } from './appraisals.service';
import { CurrentUser, AuthUser } from '../auth/current-user';
import { NoAdmin } from '../auth/roles.decorator';

/* Appraisal content endpoints — hard-blocked for Platform Admin (§3). */
@Controller('appraisals')
@NoAdmin()
export class AppraisalsController {
  constructor(private readonly svc: AppraisalsService) {}

  private ip(req: any): string | undefined {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.getOne(user, id);
  }

  @Post()
  assign(@CurrentUser() user: AuthUser, @Body() body: { employeeId: string; templateId: string; cycleId?: string }) {
    return this.svc.assign(user, body.employeeId, body.templateId, body.cycleId);
  }

  @Patch(':id')
  patch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.patchSelf(user, id, body);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: any) {
    return this.svc.submit(user, id, this.ip(req));
  }

  @Post(':id/manager-review')
  managerReview(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.svc.managerReview(user, id, body, this.ip(req));
  }

  @Post(':id/decision')
  decision(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { action: 'approve' | 'request' | 'reject'; comment?: string }, @Req() req: any) {
    return this.svc.decision(user, id, body.action, body.comment ?? '', this.ip(req));
  }

  @Post(':id/sign')
  sign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { party: 'employee' | 'manager'; name: string }, @Req() req: any) {
    return this.svc.sign(user, id, body.party, body.name, this.ip(req));
  }

  @Post(':id/final-comments')
  finalComments(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { employee?: string; manager?: string }) {
    return this.svc.setFinalComments(user, id, body);
  }
}
