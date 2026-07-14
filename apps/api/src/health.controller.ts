import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/roles.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
