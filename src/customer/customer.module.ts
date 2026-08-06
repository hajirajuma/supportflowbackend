import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { CustomerController } from './customer.controller';
import { CustomerPortalService } from './services/customer-portal.service';
import { CustomerProfileService } from './services/customer-profile.service';
import { CustomerNotificationService } from './services/notification.service';
import { SupportInformationService } from './services/support-information.service';

@Module({
  imports: [PrismaModule, StorageModule, AuditLogModule, KnowledgeModule],
  controllers: [CustomerController],
  providers: [
    CustomerPortalService,
    CustomerProfileService,
    CustomerNotificationService,
    SupportInformationService,
  ],
})
export class CustomerModule {}
