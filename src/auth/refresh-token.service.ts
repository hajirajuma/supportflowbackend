import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomUUID } from 'node:crypto';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Refresh tokens are stored as SHA-256 digests so a database leak never
 * exposes usable tokens, and lookups are a single indexed query instead of the
 * previous O(N) scan + bcrypt comparison over every live token.
 */
@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createRefreshToken(userId: string) {
    const token = randomUUID();
    const tokenHash = RefreshTokenService.hashToken(token);

    await (this.prisma as any).refreshToken.create({
      data: {
        token: tokenHash,
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return token;
  }

  async verifyRefreshToken(token: string) {
    const record = await (this.prisma as any).refreshToken.findUnique({
      where: { token: RefreshTokenService.hashToken(token) },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { userId: record.userId as string, tokenId: record.id as string };
  }

  async rotateRefreshToken(userId: string, previousToken: string) {
    await this.revokeRefreshToken(previousToken);
    return this.createRefreshToken(userId);
  }

  async revokeRefreshToken(token: string) {
    await (this.prisma as any).refreshToken.updateMany({
      where: { token: RefreshTokenService.hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
