import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { needsOverrideReason } from './override';

describe('needsOverrideReason', () => {
  it('asks a club-roleless Admin and nobody else', () => {
    expect(needsOverrideReason('ADMIN', [])).toBe(true);
    expect(needsOverrideReason('ADMIN', ['LEAD'])).toBe(false);
    expect(needsOverrideReason('ADMIN', ['MARKETING'])).toBe(false);
    expect(needsOverrideReason('STUDENT', [])).toBe(false);
    expect(needsOverrideReason('STUDENT', ['LEAD'])).toBe(false);
  });

  it('matches the rule the API enforces', () => {
    const source = readFileSync('../api/src/auth/field-permissions.ts', 'utf8');
    expect(source).toContain(
      "if (facts.platformRole !== 'ADMIN' || facts.clubRoles.length > 0) return undefined;",
    );
  });
});
