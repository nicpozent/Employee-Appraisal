import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { ScopeService } from '../common/scope.service';

@Module({ controllers: [AnalyticsController], providers: [ScopeService] })
export class AnalyticsModule {}
