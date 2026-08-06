import { SlugUtil } from './slug.util';

describe('SlugUtil', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(SlugUtil.create('Billing Support')).toBe('billing-support');
  });

  it('strips non-alphanumeric characters', () => {
    expect(SlugUtil.create('FAQ & Help!')).toBe('faq-help');
  });

  it('collapses repeated hyphens', () => {
    expect(SlugUtil.create('a   b - c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(SlugUtil.create('-hello-')).toBe('hello');
  });

  it('handles empty input', () => {
    expect(SlugUtil.create('')).toBe('');
    expect(SlugUtil.create('   ')).toBe('');
  });
});
