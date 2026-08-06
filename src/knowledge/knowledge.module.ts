import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RequestContextModule } from '../request-context/request-context.module';
import { KnowledgeBaseService } from '../customer/services/knowledge-base.service';
import { KnowledgeController } from './knowledge.controller';

@Module({
  imports: [PrismaModule, AuditLogModule, RequestContextModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeModule {}
