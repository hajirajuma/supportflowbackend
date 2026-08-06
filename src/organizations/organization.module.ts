import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { MemberService } from './member.service';
import { BrandingService } from './branding.service';
import { InvitationService } from './invitation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    OrganizationSettingsService,
    MemberService,
    BrandingService,
    InvitationService,
  ],
  exports: [OrganizationService, InvitationService, MemberService],
})
export class OrganizationModule {}
