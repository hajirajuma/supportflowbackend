import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

import configuration from './config/configuration';
import validate from './config/env.validation';

import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { StorageModule } from './storage/storage.module';
import { LoggerModule } from './logger/logger.module';
import { RequestContextModule } from './request-context/request-context.module';
import { CustomerModule } from './customer/customer.module';
import { TicketsModule } from './tickets/tickets.module';
import { FeedbackModule } from './feedback/feedback.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { HealthModule } from './health/health.module';
import { OrganizationModule } from './organizations/organization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: validate,
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttler.ttl') ?? 60_000,
            limit: config.get<number>('throttler.limit') ?? 100,
          },
        ],
      }),
    }),

    ScheduleModule.forRoot(),

    LoggerModule,
    RequestContextModule,
    AuthModule,
    PrismaModule,
    EmailModule,
    StorageModule,
    CustomerModule,
    TicketsModule,
    FeedbackModule,
    NotificationsModule,
    SubscriptionsModule,
    OrganizationModule,
    DashboardModule,
    PlatformAdminModule,
    HealthModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    TenantMiddleware,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
