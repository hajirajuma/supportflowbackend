import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DashboardController } from './dashboard.controller';
import { DashboardGateway } from './gateway/dashboard.gateway';
import { DashboardAccessGuard } from './guards/dashboard-access.guard';
import { DashboardService } from './services/dashboard.service';
import { AnalyticsService } from './services/analytics.service';
import { ChartService } from './services/chart.service';
import { ExportService } from './services/export.service';
import { KpiService } from './services/kpi.service';
import { ReportService } from './services/report.service';
import { RevenueService } from './services/revenue.service';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    AuditLogModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn') ?? '15m',
        } as any,
      }),
    }),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardAccessGuard,
    DashboardGateway,
    DashboardService,
    AnalyticsService,
    ChartService,
    ExportService,
    KpiService,
    ReportService,
    RevenueService,
  ],
  exports: [DashboardService, AnalyticsService, ReportService, ExportService],
})
export class DashboardModule {}
