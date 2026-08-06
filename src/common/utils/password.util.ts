import * as bcrypt from 'bcrypt';

export class PasswordUtil {
  static async hash(password: string, rounds = 12): Promise<string> {
    return bcrypt.hash(password, rounds);
  }

  static async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
