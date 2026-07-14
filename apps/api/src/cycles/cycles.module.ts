import { Module } from '@nestjs/common';
import { CyclesService } from './cycles.service';
import { CyclesController } from './cycles.controller';

@Module({
  providers: [CyclesService],
  controllers: [CyclesController],
})
export class CyclesModule {}
