import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setDefaultAutoSelectFamily } from 'node:net';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

// Node >= 22 enables Happy Eyeballs (IPv6-first) by default. The Neon host only
// resolves to IPv4, and the dual-stack probe hangs until ETIMEDOUT, surfacing
// as misleading Prisma "Invalid ... invocation" errors. Force IPv4-first.
setDefaultAutoSelectFamily(false);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const connectionString =
      configService.get<string>('database.url') ?? process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not configured. Set DATABASE_URL in your environment before starting the server.',
      );
    }

    // Raise the pg pool above the default (10) so the dashboard/analytics
    // Promise.all batches don't queue behind each other on the remote DB.
    const adapter = new PrismaPg({
      connectionString,
      max: 25,
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

