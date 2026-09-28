import { describe, expect, it } from 'vitest';
import { CROCKFORD, serialNumber, verificationCode } from './certificate-codes';

describe('the Crockford alphabet', () => {
  it('excludes I, L, O and U, which is the entire reason for using it', () => {
    // Catches a stock RFC 4648 base32.
    expect(CROCKFORD).toHaveLength(32);
    for (const excluded of ['I', 'L', 'O', 'U']) {
      expect(CROCKFORD).not.toContain(excluded);
    }
  });
});

describe('serialNumber', () => {
  it('is MJL, the year it was issued, and eight characters', () => {
    expect(serialNumber(new Date('2026-09-12T00:00:00Z'))).toMatch(/^MJL-2026-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it('does not repeat itself', () => {
    // Catches a serial derived from the date alone.
    const seen = new Set(Array.from({ length: 500 }, () => serialNumber()));
    expect(seen.size).toBe(500);
  });
});

describe('verificationCode', () => {
  it('carries at least 128 bits, in groups that can be read aloud', () => {
    const code = verificationCode();
    const groups = code.split('-');

    expect(groups).toHaveLength(6);
    for (const group of groups) expect(group).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
    // An enumerable code could be guessed.
    expect(groups.join('').length * 5).toBeGreaterThanOrEqual(128);
  });

  it('spreads over the whole alphabet rather than a corner of it', () => {
    // Catches a weak or hex-truncated generator: 15,000 chars should hit all 32 symbols.
    const chars = new Set(Array.from({ length: 500 }, () => verificationCode()).join('').replaceAll('-', ''));
    expect(chars.size).toBe(32);
  });
});
