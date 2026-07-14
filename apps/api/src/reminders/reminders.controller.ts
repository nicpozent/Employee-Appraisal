import { Controller, Post } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { Roles } from '../auth/roles.decorator';

/* Manual trigger for the reminder sweep (admin) — useful for testing. */
@Controller('reminders')
@Roles('admin')
export class RemindersController {
  constructor(private readonly svc: RemindersService) {}

  @Post('run')
  run() {
    return this.svc.runSweep();
  }
}
