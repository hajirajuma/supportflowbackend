import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BrevoEmailService } from '../email/brevo.service';
import { PasswordUtil } from '../common/utils/password.util';
import { InviteUserDto } from './dto/invite-user.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Injectable()
export class InvitationService {
  private readonly invitationTtlDays = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: BrevoEmailService,
  ) {}

  async createInvitation(
    userId: string,
    organizationId: string,
    dto: InviteUserDto,
  ) {
    const existingUser = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const existingInvitation = await (this.prisma as any).invitation.findUnique(
      {
        where: { organizationId_email: { organizationId, email: dto.email } },
      },
    );

    if (existingInvitation && existingInvitation.status === 'PENDING') {
      throw new ConflictException(
        'An invitation has already been sent to this email',
      );
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.invitationTtlDays);

    const invitation = await (this.prisma as any).invitation.create({
      data: {
        organizationId,
        email: dto.email,
        role: dto.role,
        token,
        status: 'PENDING',
        invitedById: userId,
        expiresAt,
      },
    });

    await this.emailService.sendInvitationEmail(
      dto.email,
      dto.email,
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/accept-invitation?token=${token}`,
    );

    return {
      success: true,
      message: 'Invitation sent successfully',
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    };
  }

  async listInvitations(organizationId: string) {
    const invitations = await (this.prisma as any).invitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'Invitations retrieved successfully',
      data: invitations,
    };
  }

  async resendInvitation(organizationId: string, invitationId: string) {
    const invitation = await (this.prisma as any).invitation.findFirst({
      where: { id: invitationId, organizationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Only pending invitations can be resent');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.invitationTtlDays);

    await (this.prisma as any).invitation.update({
      where: { id: invitation.id },
      data: { token, expiresAt },
    });

    await this.emailService.sendInvitationEmail(
      invitation.email,
      invitation.email,
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/accept-invitation?token=${token}`,
    );

    return {
      success: true,
      message: 'Invitation resent successfully',
      data: null,
    };
  }

  async cancelInvitation(organizationId: string, invitationId: string) {
    const invitation = await (this.prisma as any).invitation.findFirst({
      where: { id: invitationId, organizationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status === 'ACCEPTED') {
      throw new BadRequestException(
        'An accepted invitation cannot be cancelled',
      );
    }

    await (this.prisma as any).invitation.update({
      where: { id: invitation.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    return {
      success: true,
      message: 'Invitation cancelled successfully',
      data: null,
    };
  }

  async validateInvitationToken(token: string) {
    const invitation = await (this.prisma as any).invitation.findUnique({
      where: { token },
    });

    if (!invitation || invitation.status !== 'PENDING') {
      throw new BadRequestException(
        'Invitation is invalid or has already been used',
      );
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    const organization = await (this.prisma as any).organization.findUnique({
      where: { id: invitation.organizationId },
    });

    return {
      success: true,
      message: 'Invitation is valid',
      data: {
        email: invitation.email,
        role: invitation.role,
        organizationName: organization?.name ?? null,
      },
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const invitation = await (this.prisma as any).invitation.findUnique({
      where: { token: dto.token },
    });

    if (!invitation || invitation.status !== 'PENDING') {
      throw new BadRequestException(
        'Invitation is invalid or has already been used',
      );
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invitation has expired');
    }

    const existingUser = await (this.prisma as any).user.findUnique({
      where: { email: invitation.email },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await PasswordUtil.hash(dto.password);

    const user = await (this.prisma as any).user.create({
      data: {
        email: invitation.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: invitation.role,
        status: 'ACTIVE',
        emailVerified: true,
        organizationId: invitation.organizationId,
      },
    });

    await (this.prisma as any).invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedById: user.id,
        acceptedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Invitation accepted successfully',
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }
}
