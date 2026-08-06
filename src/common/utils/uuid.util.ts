import { randomUUID } from 'node:crypto';

export class UuidUtil {
  static generate(): string {
    return randomUUID();
  }
}
