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
import { PrismaService } from '../prisma/prisma.service';

/**
 * Real-time notification gateway.
 *
 * Authentication: the client passes a JWT via `auth: { token }` (recommended)
 * or `query.token` during the Socket.IO handshake. Users are joined to
 * `user:{userId}` and `org:{organizationId}` rooms; all emissions target
 * those rooms so tenants never observe another tenant's traffic.
 */
@Injectable()
@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

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

      await client.join(`user:${user.id}`);
      if (user.organizationId) {
        await client.join(`org:${user.organizationId}`);
      }
    } catch (error) {
      this.logger.warn(
        `Rejected socket connection: ${(error as Error).message}`,
      );
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    // Rooms are automatically cleaned by Socket.IO on disconnect.
    client.removeAllListeners();
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server.to(`org:${organizationId}`).emit(event, payload);
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
