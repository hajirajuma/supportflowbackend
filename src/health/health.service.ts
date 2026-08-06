import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase.storage.service';
import { BrevoEmailService } from '../email/brevo.service';

export interface HealthCheckResult {
  status: 'up' | 'down';
  latencyMs: number;
  detail?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: SupabaseStorageService,
    private readonly emailService: BrevoEmailService,
    private readonly configService: ConfigService,
  ) {}

  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  getServiceInfo() {
    return {
      name: 'supportflow-backend',
      version: process.env.npm_package_version ?? '0.0.1',
      environment: this.configService.get('NODE_ENV') ?? 'development',
      uptimeSeconds: this.getUptimeSeconds(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Database probe — fails the readiness check when unreachable. */
  async checkDatabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error(
        `Database health check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  /** Supabase storage probe — skipped when not configured. */
  async checkStorage(): Promise<HealthCheckResult> {
    const start = Date.now();
    if (!this.configService.get<string>('supabase.url')) {
      return { status: 'up', latencyMs: 0, detail: 'not-configured' };
    }
    try {
      await this.storageService.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error(
        `Storage health check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  /** Brevo email probe — checks configuration and account reachability. */
  async checkEmail(): Promise<HealthCheckResult> {
    const start = Date.now();
    if (!this.configService.get<string>('brevo.apiKey')) {
      return { status: 'up', latencyMs: 0, detail: 'not-configured' };
    }
    try {
      await this.emailService.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error(
        `Email health check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  /** PayChangu probe — configuration presence only (no network call). */
  async checkPayments(): Promise<HealthCheckResult> {
    const secretKey = this.configService.get<string>('paychangu.secretKey');
    if (!secretKey) {
      return { status: 'up', latencyMs: 0, detail: 'not-configured' };
    }
    return {
      status: 'up',
      latencyMs: 0,
      detail: this.configService.get<boolean>('paychangu.isSandbox')
        ? 'sandbox'
        : 'live',
    };
  }

  /** Full dependency matrix used by /health/deps. */
  async checkAll(): Promise<Record<string, HealthCheckResult>> {
    const [database, storage, email, payments] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
      this.checkEmail(),
      this.checkPayments(),
    ]);
    return { database, storage, email, payments };
  }
}
