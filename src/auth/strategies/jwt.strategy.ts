import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: any) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    // The tenant (organizationId) is always re-read from the database rather
    // than trusted from the JWT, so a stale or tampered claim can never be
    // used to move a user into another organization.
    return {
      userId: user.id,
      tenantId: user.organizationId,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    };
  }
}
