import { PinoLogger } from 'nestjs-pino';
import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let pino: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    trace: jest.Mock;
  };
  let service: LoggerService;

  beforeEach(() => {
    pino = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    };
    service = new LoggerService(pino as unknown as PinoLogger);
  });

  it('delegates log() to pino info', () => {
    service.log('hello');
    expect(pino.info).toHaveBeenCalledWith({}, 'hello');
  });

  it('attaches a string context', () => {
    service.log('hello', 'AppModule');
    expect(pino.info).toHaveBeenCalledWith({ context: 'AppModule' }, 'hello');
  });

  it('delegates warn/error/debug/verbose', () => {
    service.warn('careful');
    expect(pino.warn).toHaveBeenCalledWith({}, 'careful');

    service.error('boom', { context: 'AuthService' });
    expect(pino.error).toHaveBeenCalledWith({ context: 'AuthService' }, 'boom');

    service.debug('trace', { userId: 'u-1' });
    expect(pino.debug).toHaveBeenCalledWith({ userId: 'u-1' }, 'trace');

    service.verbose('v', 'X');
    expect(pino.trace).toHaveBeenCalledWith({ context: 'X' }, 'v');
  });
});
