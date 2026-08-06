import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DashboardAccessGuard } from '../dashboard/guards/dashboard-access.guard';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [PrismaModule, AuditLogModule, KnowledgeModule],
  controllers: [PlatformAdminController],
  providers: [DashboardAccessGuard, PlatformAdminService],
})
export class PlatformAdminModule {}
