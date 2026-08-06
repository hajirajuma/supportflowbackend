import { PaginationUtil } from './pagination.util';

describe('PaginationUtil', () => {
  describe('normalizePage', () => {
    it('defaults to page 1 when undefined', () => {
      expect(PaginationUtil.normalizePage(undefined)).toBe(1);
    });

    it('clamps pages below 1', () => {
      expect(PaginationUtil.normalizePage(0)).toBe(1);
      expect(PaginationUtil.normalizePage(-5)).toBe(1);
    });

    it('keeps valid pages', () => {
      expect(PaginationUtil.normalizePage(7)).toBe(7);
    });
  });

  describe('normalizeLimit', () => {
    it('defaults to 10 when undefined', () => {
      expect(PaginationUtil.normalizeLimit(undefined)).toBe(10);
    });

    it('clamps limits below 1', () => {
      expect(PaginationUtil.normalizeLimit(0)).toBe(1);
    });

    it('caps limits at the maximum of 100', () => {
      expect(PaginationUtil.normalizeLimit(10_000)).toBe(100);
    });

    it('keeps valid limits', () => {
      expect(PaginationUtil.normalizeLimit(25)).toBe(25);
    });
  });

  describe('getSkip', () => {
    it('computes the offset', () => {
      expect(PaginationUtil.getSkip(1, 10)).toBe(0);
      expect(PaginationUtil.getSkip(3, 25)).toBe(50);
    });
  });
});
