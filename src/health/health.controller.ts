import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness: the process is up and serving requests. */
  @Public()
  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return {
      status: 'ok',
      ...this.healthService.getServiceInfo(),
    };
  }

  /** Liveness alias for orchestrators that prefer an explicit path. */
  @Public()
  @Get('live')
  @HttpCode(200)
  @ApiOperation({ summary: 'Liveness probe (alias)' })
  liveAlias() {
    return this.live();
  }

  /**
   * Readiness: the app can serve traffic. Fails (503) when the database is
   * unreachable. External dependencies (storage/email/payments) are reported
   * but don't fail readiness unless the database is down — the app degrades
   * gracefully around them.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (database dependent)' })
  async ready() {
    const database = await this.healthService.checkDatabase();
    if (database.status === 'down') {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database },
        timestamp: new Date().toISOString(),
      });
    }
    return {
      status: 'ready',
      checks: { database },
      ...this.healthService.getServiceInfo(),
    };
  }

  /** Detailed per-dependency health matrix (always 200). */
  @Public()
  @Get('deps')
  @ApiOperation({ summary: 'Detailed dependency health matrix' })
  async deps() {
    const checks = await this.healthService.checkAll();
    const allUp = Object.values(checks).every((c) => c.status === 'up');
    return {
      status: allUp ? 'ok' : 'degraded',
      checks,
      ...this.healthService.getServiceInfo(),
    };
  }
}
