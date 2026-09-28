import { describe, expect, it } from 'vitest';
import { revokeCertificateBodySchema } from './index';

describe('revokeCertificateBodySchema', () => {
  it('refuses a revocation with no reason', () => {
    expect(revokeCertificateBodySchema.safeParse({}).success).toBe(false);
    expect(revokeCertificateBodySchema.safeParse({ reason: '  ' }).success).toBe(false);
  });
});
