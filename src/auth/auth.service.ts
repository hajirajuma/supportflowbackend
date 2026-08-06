import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { EmailVerificationService } from './email-verification.service';
import { RefreshTokenService } from './refresh-token.service';
import { SlugUtil } from '../common/utils/slug.util';
import { PasswordUtil } from '../common/utils/password.util';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { BrevoEmailService } from '../email/brevo.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly emailService: BrevoEmailService,
  ) {}

  async registerOrganization(dto: RegisterOrganizationDto) {
    const normalizedSlug = SlugUtil.create(dto.organizationName);
    const subdomain = dto.subdomain ?? normalizedSlug;
    const tenantKey = `${normalizedSlug}-${randomUUID()}`;
    const passwordHash = await this.passwordService.hash(dto.password);

    const existingUser = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    let verificationToken: string | undefined;
    let payload: any;

    try {
      payload = await this.prisma.$transaction(async (tx: any) => {
        const organization = await tx.organization.create({
          data: {
            name: dto.organizationName,
            slug: normalizedSlug,
            subdomain,
            tenantKey,
            website: dto.website,
            timezone: dto.timezone ?? 'UTC',
            locale: dto.locale ?? 'en-US',
            status: 'ACTIVE',
            settings: {
              create: {
                defaultLanguage: 'EN',
                defaultTheme: 'LIGHT',
                timezone: dto.timezone ?? 'UTC',
                dateFormat: 'MM/DD/YYYY',
                feedbackAutoRequest: true,
                allowAnonymousFeedback: true,
                ticketAutoAssignment: false,
                ticketAutoCloseDays: 7,
                knowledgeBaseEnabled: true,
              },
            },
          },
        });

        const user = await tx.user.create({
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            password: passwordHash,
            role: 'TENANT_OWNER',
            status: 'PENDING_VERIFICATION',
            organizationId: organization.id,
          },
        });

        verificationToken = randomUUID();
        await tx.emailVerificationToken.upsert({
          where: { userId: user.id },
          update: {
            token: verificationToken,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
          create: {
            token: verificationToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        });

        return {
          organization,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
          },
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }
      throw error;
    }

    // The account is committed. Email delivery is best-effort: a provider
    // outage must never block registration (the user can request resend).
    try {
      await this.emailService.sendVerificationEmail(
        payload.user.email,
        payload.user.firstName,
        `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/verify-email?token=${verificationToken ?? ''}`,
      );
    } catch {
      // Swallow: verification email failures are surfaced by the resend flow.
    }

    return {
      success: true,
      message:
        'Organization registered successfully. Please verify your email address.',
      data: payload,
    };
  }

  async login(dto: LoginDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await PasswordUtil.compare(
      dto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Please verify your email before logging in.',
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Your account is not active.');
    }

    const accessToken = await this.tokenService.signAccessToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    });

    const refreshToken = await this.refreshTokenService.createRefreshToken(
      user.id,
    );

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          organizationId: user.organizationId,
        },
      },
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const payload = await this.refreshTokenService.verifyRefreshToken(
      dto.refreshToken,
    );

    const user = await (this.prisma as any).user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.tokenService.signAccessToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    });

    const refreshToken = await this.refreshTokenService.rotateRefreshToken(
      payload.userId,
      dto.refreshToken,
    );

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken,
        refreshToken,
      },
    };
  }

  async logout(dto: RefreshTokenDto) {
    await this.refreshTokenService.revokeRefreshToken(dto.refreshToken);

    return {
      success: true,
      message: 'Logged out successfully',
      data: null,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      return {
        success: true,
        message: 'If the email exists, a password reset link has been sent.',
        data: null,
      };
    }

    const resetToken = await this.passwordService.createResetToken(user.id);
    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.firstName,
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password?token=${resetToken}`,
    );

    return {
      success: true,
      message: 'If the email exists, a password reset link has been sent.',
      data: null,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenRecord = await this.passwordService.validateResetToken(
      dto.token,
    );
    const passwordHash = await this.passwordService.hash(dto.password);

    await (this.prisma as any).user.update({
      where: { id: tokenRecord.userId },
      data: { password: passwordHash },
    });

    await (this.prisma as any).passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    return {
      success: true,
      message: 'Password reset successfully',
      data: null,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const verificationToken = await this.emailVerificationService.validateToken(
      dto.token,
    );

    await (this.prisma as any).user.update({
      where: { id: verificationToken.userId },
      data: {
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    return {
      success: true,
      message: 'Email verified successfully',
      data: null,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        organizationId: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      success: true,
      message: 'Current user retrieved successfully',
      data: user,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await PasswordUtil.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newPasswordHash = await this.passwordService.hash(dto.newPassword);

    await (this.prisma as any).user.update({
      where: { id: user.id },
      data: { password: newPasswordHash },
    });

    return {
      success: true,
      message: 'Password changed successfully',
      data: null,
    };
  }
}
