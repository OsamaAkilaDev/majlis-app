import { describe, expect, it } from 'vitest';
import { IMAGE_KINDS, academicYearSchema, clubDetailSchema, createClubBodySchema, patchClubStatusBodySchema } from './index';

describe('academicYearSchema', () => {
  it('rejects a year pair that is not consecutive', () => {
    // Catches /^\d{4}\/\d{4}$/ alone, which accepts 2026/2030 and 2026/2020.
    expect(academicYearSchema.safeParse('2026/2030').success).toBe(false);
    expect(academicYearSchema.safeParse('2026/2025').success).toBe(false);
  });

  it('accepts a consecutive pair', () => {
    expect(academicYearSchema.safeParse('2026/2027').success).toBe(true);
  });

  it('rejects a shape that is not four digits, slash, four digits', () => {
    expect(academicYearSchema.safeParse('26/27').success).toBe(false);
    expect(academicYearSchema.safeParse('2026-2027').success).toBe(false);
  });
});

describe('patchClubStatusBodySchema', () => {
  it('rejects a body with no reason', () => {
    expect(patchClubStatusBodySchema.safeParse({ status: 'SUSPENDED' }).success).toBe(false);
  });

  it('rejects a whitespace-only reason', () => {
    expect(
      patchClubStatusBodySchema.safeParse({ status: 'SUSPENDED', reason: '   ' }).success,
    ).toBe(false);
  });

  it('rejects a status outside the three real values', () => {
    expect(
      patchClubStatusBodySchema.safeParse({ status: 'DELETED', reason: 'x' }).success,
    ).toBe(false);
  });
});

describe('createClubBodySchema', () => {

  it('rejects a clubId that is not a UUID', () => {
    // A non-UUID reaches Prisma and raises P2007 rather than a clean 400.
    const body = {
      clubId: 'not-a-uuid',
      departmentId: '01936c7e-0000-7000-8000-000000000001',
      name: 'Robotics',
      description: 'We build robots.',
      category: 'Technology',
      academicYear: '2026/2027',
      membershipPolicy: 'OPEN',
    };
    expect(createClubBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('clubDetailSchema', () => {
  it('accepts a null pending count and refuses an absent one', () => {
    // On the field: `.nullish()` would let the API omit the key and every client render no badge.
    const field = clubDetailSchema.shape.pendingMemberCount;
    expect(field.safeParse(null).success).toBe(true);
    expect(field.safeParse(3).success).toBe(true);
    expect(field.safeParse(undefined).success).toBe(false);
  });
});

describe('IMAGE_KINDS', () => {
  it('caps every kind under the 2MB Supabase bucket limit', () => {
    // Catches a maxBytes above the bucket's own reject threshold, a cap that never fires.
    for (const kind of Object.values(IMAGE_KINDS)) {
      expect(kind.maxBytes).toBeLessThan(2 * 1024 * 1024);
    }
  });
});
