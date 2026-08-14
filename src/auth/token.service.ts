import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

export type JwtPayload = {
  userId: string;
  /** The tenant the user belongs to. Mirrors organizationId for clarity. */
  tenantId?: string | null;
  organizationId?: string | null;
  role: string;
  email: string;
};

const DEFAULT_ACCESS_TTL = '15m';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.sign(payload, {
      expiresIn: (this.configService.get<string>('jwt.expiresIn') ??
        DEFAULT_ACCESS_TTL) as any,
    });
  }

  async signRefreshToken(): Promise<string> {
    return randomUUID();
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verify<JwtPayload>(token);
  }
}
