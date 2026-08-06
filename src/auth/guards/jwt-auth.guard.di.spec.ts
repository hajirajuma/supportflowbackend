import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RequestContextService } from '../../request-context/request-context.service';
import { JwtAuthGuard } from './jwt-auth.guard';

jest.mock('../../generated/prisma/client', () => ({}), { virtual: true });

@Injectable()
class MockReqCtx {
  getCurrent = jest.fn().mockReturnValue(undefined);
}

@Module({
  providers: [{ provide: RequestContextService, useClass: MockReqCtx }],
  exports: [RequestContextService],
})
class CtxModule {}

@Module({
  imports: [CtxModule],
  providers: [JwtAuthGuard],
  exports: [JwtAuthGuard],
})
class GuardModule {}

describe('JwtAuthGuard DI (mixin regression probe)', () => {
  it('resolves Reflector + RequestContextService via the container', async () => {
    const mod = await Test.createTestingModule({
      imports: [GuardModule],
    }).compile();
    const guard = mod.get(JwtAuthGuard);
    const reflector = mod.get(Reflector);
    const ctx = mod.get(RequestContextService);

    expect(reflector).toBeDefined();
    expect(guard).toBeDefined();

    expect((guard as any).reflector).toBeDefined();

    expect((guard as any).requestContextService).toBeDefined();
    expect(ctx).toBeDefined();
  });
});
