import { PasswordUtil } from './password.util';

describe('PasswordUtil', () => {
  describe('hash', () => {
    it('produces a bcrypt hash distinct from the plaintext', async () => {
      const hash = await PasswordUtil.hash('Sup3rSecret!');
      expect(hash).toBeDefined();
      expect(hash).not.toContain('Sup3rSecret!');
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('produces different salts for identical passwords', async () => {
      const [a, b] = await Promise.all([
        PasswordUtil.hash('same-password'),
        PasswordUtil.hash('same-password'),
      ]);
      expect(a).not.toEqual(b);
    });
  });

  describe('compare', () => {
    it('returns true for the correct password', async () => {
      const hash = await PasswordUtil.hash('CorrectHorseBattery');
      await expect(
        PasswordUtil.compare('CorrectHorseBattery', hash),
      ).resolves.toBe(true);
    });

    it('returns false for an incorrect password', async () => {
      const hash = await PasswordUtil.hash('CorrectHorseBattery');
      await expect(PasswordUtil.compare('wrong', hash)).resolves.toBe(false);
    });
  });
});
