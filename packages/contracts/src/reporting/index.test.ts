import { describe, expect, it } from 'vitest';
import { clubReportSchema } from './index';

describe('clubReportSchema', () => {
  it('rejects an attendance rate outside 0..1', () => {
    const base = {
      clubId: '0199a0a0-0000-7000-8000-000000000000',
      events: 1,
      registrations: 2,
      expected: 2,
      attended: 1,
      certificatesIssued: 0,
    };
    expect(() => clubReportSchema.parse({ ...base, attendanceRate: 1.5 })).toThrow();
    expect(clubReportSchema.parse({ ...base, attendanceRate: 0.5 }).attendanceRate).toBe(0.5);
  });
});
