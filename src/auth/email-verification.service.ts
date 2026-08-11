import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(userId: string) {
    const token = randomUUID();

    await (this.prisma as any).emailVerificationToken.upsert({
      where: { userId },
      update: {
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      create: {
        token,
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return token;
  }

  async findByToken(token: string) {
    return (this.prisma as any).emailVerificationToken.findUnique({
      where: { token },
    });
  }

  async validateToken(token: string) {
    const verificationToken = await (
      this.prisma as any
    ).emailVerificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    if (verificationToken.usedAt || verificationToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    return verificationToken;
  }
}
