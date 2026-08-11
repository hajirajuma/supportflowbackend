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

    const existingInvitation = await (this.prisma as any).invitation.findFirst({
      where: { organizationId, email: dto.email },
    });

    if (existingInvitation && existingInvitation.status === 'PENDING') {
      throw new ConflictException(
        'An invitation has already been sent to this email',
      );
    }

    const token = randomBytes(32).toString('hex');
    const ttlDays = dto.expiresIn ?? this.invitationTtlDays;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

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

    const invitationLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/accept-invitation?token=${token}`;

    let emailDelivered = false;
    let emailError: string | null = null;
    try {
      await this.emailService.sendInvitationEmail(
        dto.email,
        dto.email,
        invitationLink,
      );
      emailDelivered = true;
    } catch (error) {
      // The invitation row is already committed. An email outage (or an
      // unverified Brevo sender) must not turn this into a 500 — instead we
      // report the failure so the UI can offer the copy-link fallback.
      emailError = error instanceof Error ? error.message : String(error);
      console.error('Failed to send invitation email:', error);
    }

    return {
      success: true,
      message: emailDelivered
        ? 'Invitation sent successfully'
        : 'Invitation created, but the invitation email could not be sent',
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        emailDelivered,
        emailError,
        invitationLink,
      },
    };
  }

  async listInvitations(organizationId: string) {
    const invitations = await (this.prisma as any).invitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Normalize role/status to lowercase so the frontend's Invitation type
    // (pending/accepted/revoked + OrganizationRole) matches without crashing.
    // Once a customer or support agent accepts, the invitation is never
    // reported as "pending" — acceptedAt is authoritative even if the status
    // column lags.
    const data = invitations.map((inv: any) => ({
      ...inv,
      role: inv.role?.toLowerCase(),
      status: inv.acceptedAt
        ? 'accepted'
        : inv.status?.toLowerCase(),
    }));

    return {
      success: true,
      message: 'Invitations retrieved successfully',
      data,
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

    const invitationLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/accept-invitation?token=${token}`;

    let emailDelivered = false;
    try {
      await this.emailService.sendInvitationEmail(
        invitation.email,
        invitation.email,
        invitationLink,
      );
      emailDelivered = true;
    } catch (error) {
      console.error('Failed to resend invitation email:', error);
    }

    return {
      success: true,
      message: emailDelivered
        ? 'Invitation resent successfully'
        : 'Invitation updated, but the email could not be sent',
      data: {
        emailDelivered,
        invitationLink,
      },
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
      include: {
        invitedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
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
      select: { name: true, subdomain: true },
    });

    return {
      success: true,
      message: 'Invitation is valid',
      data: {
        token: invitation.token,
        email: invitation.email,
        role: invitation.role?.toLowerCase(),
        organizationName: organization?.name ?? null,
        subdomain: organization?.subdomain ?? null,
        expiresAt: invitation.expiresAt,
        invitedBy: invitation.invitedBy
          ? {
              firstName: invitation.invitedBy.firstName,
              lastName: invitation.invitedBy.lastName,
              email: invitation.invitedBy.email,
            }
          : null,
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
        password: passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: invitation.role,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
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

    // The invited user stays bound to the inviting organization (its id is
    // set above), and the success payload carries the organization's name and
    // subdomain so the frontend can send the user to that exact tenant's
    // login page — never another organization's.
    const organization = await (this.prisma as any).organization.findUnique({
      where: { id: invitation.organizationId },
      select: { name: true, subdomain: true },
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
        organizationName: organization?.name ?? null,
        subdomain: organization?.subdomain ?? null,
      },
    };
  }
}
