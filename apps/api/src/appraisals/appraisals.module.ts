import { Module } from '@nestjs/common';
import { AppraisalsService } from './appraisals.service';
import { AppraisalsController } from './appraisals.controller';
import { ScopeService } from '../common/scope.service';

@Module({
  providers: [AppraisalsService, ScopeService],
  controllers: [AppraisalsController],
  exports: [AppraisalsService],
})
export class AppraisalsModule {}
