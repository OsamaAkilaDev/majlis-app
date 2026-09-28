import { describe, expect, it } from 'vitest';
import { checkInResultSchema, correctAttendanceBodySchema, manualCheckInBodySchema } from './index';

describe('checkInResultSchema', () => {
  it('strips personal data from a failure result', () => {
    const parsed = checkInResultSchema.parse({
      result: 'NOT_REGISTERED',
      fullName: 'Unrelated Student',
      email: 'unrelated@uni.ac.ae',
    });

    expect(parsed).toEqual({ result: 'NOT_REGISTERED' });
  });

  it('requires the original time on ALREADY_CHECKED_IN', () => {
    expect(
      checkInResultSchema.safeParse({
        result: 'ALREADY_CHECKED_IN',
        fullName: 'A Student',
        email: 'a@uni.ac.ae',
      }).success,
    ).toBe(false);
  });
});

describe('manualCheckInBodySchema', () => {
  it('normalises the email the operator typed and requires a reason', () => {
    // Stored lowercased under a CHECK, so a raw lookup finds nobody and reads as "not registered".
    expect(manualCheckInBodySchema.parse({ email: ' Ops@Uni.AC.ae ', reason: 'Phone died' }).email).toBe(
      'ops@uni.ac.ae',
    );
    expect(manualCheckInBodySchema.safeParse({ email: 'a@uni.ac.ae' }).success).toBe(false);
  });
});

describe('correctAttendanceBodySchema', () => {
  it('takes the state being asserted, not a toggle', () => {
    expect(correctAttendanceBodySchema.parse({ present: false, reason: 'Left early' }).present).toBe(false);
    expect(correctAttendanceBodySchema.safeParse({ reason: 'Left early' }).success).toBe(false);
  });
});
