import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { loadConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { AuditModule } from './audit/audit.module';
import { GraphModule } from './graph/graph.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MeModule } from './me/me.module';
import { AppraisalsModule } from './appraisals/appraisals.module';
import { TemplatesModule } from './templates/templates.module';
import { CyclesModule } from './cycles/cycles.module';
import { UsersModule } from './users/users.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SecurityModule } from './security/security.module';
import { GdprModule } from './gdpr/gdpr.module';
import { RemindersModule } from './reminders/reminders.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [() => ({ app: loadConfig() })] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AuditModule,
    GraphModule,
    NotificationsModule,
    MeModule,
    AppraisalsModule,
    TemplatesModule,
    CyclesModule,
    UsersModule,
    AnalyticsModule,
    SecurityModule,
    GdprModule,
    RemindersModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
