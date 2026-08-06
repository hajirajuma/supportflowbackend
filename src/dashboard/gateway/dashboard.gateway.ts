import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Real-time dashboard gateway.
 *
 * Clients connect to the `/dashboard` namespace and authenticate with a JWT
 * (`auth: { token }` or `query.token`). They are joined to:
 *   - `dashboard:user:{userId}`
 *   - `dashboard:org:{organizationId}`  (if they belong to an organization)
 *   - `dashboard:platform`              (platform admins only)
 *
 * All emissions target these rooms so a tenant can never observe another
 * tenant's dashboard traffic.
 */
@Injectable()
@WebSocketGateway({
  namespace: '/dashboard',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class DashboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DashboardGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new UnauthorizedException('Missing JWT token');

      const payload = this.jwtService.verify<{ userId: string }>(token, {
        secret: this.configService.getOrThrow<string>('jwt.secret'),
      });

      const user = await (this.prisma as any).user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active');
      }

      client.data.userId = user.id;
      client.data.organizationId = user.organizationId ?? null;

      await client.join(`dashboard:user:${user.id}`);
      if (user.organizationId) {
        await client.join(`dashboard:org:${user.organizationId}`);
      }
      if (user.role === 'PLATFORM_ADMIN') {
        await client.join('dashboard:platform');
      }
    } catch (error) {
      this.logger.warn(
        `Rejected dashboard socket: ${(error as Error).message}`,
      );
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    client.removeAllListeners();
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`dashboard:user:${userId}`).emit(event, payload);
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server.to(`dashboard:org:${organizationId}`).emit(event, payload);
  }

  emitToPlatform(event: string, payload: unknown) {
    this.server.to('dashboard:platform').emit(event, payload);
  }

  emitToAll(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;
    const queryToken = client.handshake.query?.token as string | undefined;
    if (queryToken) return queryToken;
    const header = (client.handshake.headers as Record<string, unknown>)?.[
      'authorization'
    ] as string | undefined;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }
}
