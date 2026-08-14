import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { MemberService } from './member.service';
import { DepartmentService } from './department.service';
import { BrandingService } from './branding.service';
import { InvitationService } from './invitation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, EmailModule, StorageModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    OrganizationSettingsService,
    MemberService,
    DepartmentService,
    BrandingService,
    InvitationService,
  ],
  exports: [OrganizationService, InvitationService, MemberService],
})
export class OrganizationModule {}
