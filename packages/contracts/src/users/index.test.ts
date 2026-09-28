import { describe, expect, it } from 'vitest';
import { patchMeBodySchema, patchUserStatusBodySchema, userStatusSchema } from './index';

describe('userStatusSchema', () => {
  it('rejects a status outside ACTIVE/SUSPENDED', () => {
    // Catches a schema that fell back to a bare z.string().
    expect(userStatusSchema.safeParse('BANNED').success).toBe(false);
  });

  it('accepts both real statuses', () => {
    expect(userStatusSchema.safeParse('ACTIVE').success).toBe(true);
    expect(userStatusSchema.safeParse('SUSPENDED').success).toBe(true);
  });
});

describe('patchUserStatusBodySchema', () => {
  it('rejects a body with no reason at all', () => {
    // Catches an optional reason, which every integration test would pass since they all send one.
    expect(patchUserStatusBodySchema.safeParse({ status: 'SUSPENDED' }).success).toBe(false);
  });

  it('rejects a blank (whitespace-only) reason', () => {
    expect(
      patchUserStatusBodySchema.safeParse({ status: 'SUSPENDED', reason: '   ' }).success,
    ).toBe(false);
  });

  it('rejects an unknown status even with a valid reason', () => {
    expect(
      patchUserStatusBodySchema.safeParse({ status: 'DELETED', reason: 'cleanup' }).success,
    ).toBe(false);
  });

  it('accepts a real status with a non-blank reason', () => {
    const parsed = patchUserStatusBodySchema.parse({ status: 'SUSPENDED', reason: 'Policy violation.' });
    expect(parsed).toEqual({ status: 'SUSPENDED', reason: 'Policy violation.' });
  });
});

describe('patchMeBodySchema: avatarUrl', () => {
  it('rejects a javascript: URI', () => {
    // Catches `z.string().url()`: Zod 4 accepts this, and it would be echoed into every viewer's browser.
    expect(patchMeBodySchema.safeParse({ avatarUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('rejects a data: URI', () => {
    expect(patchMeBodySchema.safeParse({ avatarUrl: 'data:text/html,x' }).success).toBe(false);
  });

  it('rejects a file: URI', () => {
    expect(patchMeBodySchema.safeParse({ avatarUrl: 'file:///etc/passwd' }).success).toBe(false);
  });

  it('accepts an https URL', () => {
    expect(patchMeBodySchema.safeParse({ avatarUrl: 'https://example.test/me.png' }).success).toBe(true);
  });

  it('rejects an http URL, and anything past the length bound', () => {
    // An http avatar in an authenticated page is mixed content, which browsers block.
    expect(patchMeBodySchema.safeParse({ avatarUrl: 'http://example.test/me.png' }).success).toBe(false);
    const long = `https://example.test/${'a'.repeat(2048)}.png`;
    expect(patchMeBodySchema.safeParse({ avatarUrl: long }).success).toBe(false);
  });

  it('accepts null explicitly, distinct from omitting the field', () => {
    // Catches a dropped `.nullable()`: null explicitly clears the avatar, unlike an absent key.
    const parsed = patchMeBodySchema.parse({ avatarUrl: null });
    expect(parsed.avatarUrl).toBeNull();
  });

  it('leaves avatarUrl undefined when the key is omitted entirely', () => {
    const parsed = patchMeBodySchema.parse({});
    expect(parsed.avatarUrl).toBeUndefined();
  });
});
