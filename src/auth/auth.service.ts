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
import { ResendVerificationDto } from './dto/resend-verification.dto';
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
    const tenantKey = `${normalizedSlug}-${randomUUID()}`;
    const passwordHash = await this.passwordService.hash(dto.password);

    // ✅ Fixed: Removed (this.prisma as any)
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    let verificationToken: string | undefined;
    let payload: any;

    try {
      // ✅ Fixed: Removed (this.prisma as any)
      payload = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: dto.organizationName,
            slug: normalizedSlug,
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

    try {
      await this.emailService.sendVerificationEmail(
        payload.user.email,
        payload.user.firstName,
        `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/verify-email?token=${verificationToken ?? ''}`,
      );
    } catch (error) {
      console.error('FAILED TO SEND VERIFICATION EMAIL:', error);
      throw error;
    }

    return {
      success: true,
      message:
        'Organization registered successfully. Please verify your email address.',
      data: payload,
    };
  }

  async login(dto: LoginDto) {
    // ✅ Fixed: Removed (this.prisma as any)
    const user = await this.prisma.user.findUnique({
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
      tenantId: user.organizationId,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    });

    const refreshToken = await this.refreshTokenService.createRefreshToken(
      user.id,
      dto.rememberMe === true,
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

    // ✅ Fixed: Removed (this.prisma as any)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.tokenService.signAccessToken({
      userId: user.id,
      tenantId: user.organizationId,
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
    // ✅ Fixed: Removed (this.prisma as any)
    const user = await this.prisma.user.findUnique({
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

    // ✅ Fixed: Removed (this.prisma as any)
    await this.prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { password: passwordHash },
    });

    await this.prisma.passwordResetToken.update({
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
    const tokenRecord = await this.emailVerificationService.findByToken(
      dto.token,
    );

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    const isTokenUsable =
      !tokenRecord.usedAt && tokenRecord.expiresAt > new Date();

    // The token is scoped to a single user (and therefore a single
    // organization/tenant). Look up the current state of that exact user so we
    // only ever touch the record the login flow will later read.
    const currentUser = await this.prisma.user.findUnique({
      where: { id: tokenRecord.userId },
      select: { emailVerifiedAt: true },
    });

    if (!currentUser) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    const alreadyVerified = !!currentUser.emailVerifiedAt;

    // Idempotent: re-clicking a used/expired link for an already-verified
    // account must still succeed instead of failing the whole flow.
    if (!isTokenUsable && !alreadyVerified) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    if (isTokenUsable) {
      await this.prisma.$transaction([
        // Mark the correct user (and tenant) as verified using the same
        // emailVerifiedAt field the login flow later checks.
        this.prisma.user.update({
          where: { id: tokenRecord.userId },
          data: {
            emailVerifiedAt: new Date(),
            status: 'ACTIVE',
          },
        }),
        // Invalidate/consume the token so it cannot be replayed.
        this.prisma.emailVerificationToken.update({
          where: { id: tokenRecord.id },
          data: { usedAt: new Date() },
        }),
      ]);
    }

    // Auto-authenticate the tenant owner so the frontend can send them
    // straight to their tenant dashboard without a second login.
    const user = await this.prisma.user.findUnique({
      where: { id: tokenRecord.userId },
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

    if (!user || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    // Only mint a session when the presented token was still fresh. A used or
    // expired token must never authenticate — a replayed link would otherwise
    // become a permanent backdoor for the account. Already-verified users who
    // re-click an old link (or whose account isn't ACTIVE) get a success
    // response without credentials, and the frontend routes them to their
    // dashboard (or the login page when no session exists).
    if (!isTokenUsable || user.status !== 'ACTIVE') {
      return {
        success: true,
        message: 'Email already verified',
        data: { alreadyVerified: true },
      };
    }

    const accessToken = await this.tokenService.signAccessToken({
      userId: user.id,
      tenantId: user.organizationId,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    });

    const refreshToken = await this.refreshTokenService.createRefreshToken(
      user.id,
      false,
    );

    return {
      success: true,
      message: 'Email verified successfully',
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

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        firstName: true,
        emailVerifiedAt: true,
      },
    });

    // Do not leak whether an account exists. Already-verified accounts are a
    // no-op so unverified users always get a fresh link.
    if (!user || user.emailVerifiedAt) {
      return {
        success: true,
        message:
          'If the email exists and is not verified, a new verification link has been sent.',
        data: null,
      };
    }

    const verificationToken = await this.emailVerificationService.createToken(
      user.id,
    );

    await this.emailService.sendVerificationEmail(
      user.email,
      user.firstName,
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/verify-email?token=${verificationToken}`,
    );

    return {
      success: true,
      message: 'Verification email sent. Please check your inbox.',
      data: null,
    };
  }

  async getCurrentUser(userId: string) {
    // ✅ Fixed: Removed (this.prisma as any)
    const user = await this.prisma.user.findUnique({
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
    // ✅ Fixed: Removed (this.prisma as any)
    const user = await this.prisma.user.findUnique({
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

    await this.prisma.user.update({
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
