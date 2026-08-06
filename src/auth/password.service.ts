import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordUtil } from '../common/utils/password.util';

@Injectable()
export class PasswordService {
  constructor(private readonly prisma: PrismaService) {}

  async hash(password: string) {
    return PasswordUtil.hash(password, 12);
  }

  async compare(password: string, hash: string) {
    return PasswordUtil.compare(password, hash);
  }

  async createResetToken(userId: string) {
    const token = randomUUID();

    await (this.prisma as any).passwordResetToken.create({
      data: {
        token,
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return token;
  }

  async validateResetToken(token: string) {
    const resetToken = await (this.prisma as any).passwordResetToken.findUnique(
      {
        where: { token },
      },
    );

    if (!resetToken) {
      throw new UnauthorizedException(
        'Invalid or expired password reset token',
      );
    }

    if (resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Invalid or expired password reset token',
      );
    }

    return resetToken;
  }
}
