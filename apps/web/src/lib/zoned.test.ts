import { describe, expect, it } from 'vitest';
import { placeholderIn } from './zoned';

/** UTC+4. */
const DUBAI = 'Asia/Dubai';

describe('placeholderIn', () => {
  it('carries the zone, so the picker yields an absolute instant rather than a wall clock', () => {
    // React Aria types picked values from the placeholder; without a zone they lack toAbsoluteString.
    const value = placeholderIn(DUBAI);

    expect(value.timeZone).toBe(DUBAI);
    expect(typeof value.toAbsoluteString()).toBe('string');
  });

  it('starts at midnight in the zone it was given, not the runtime default', () => {
    const value = placeholderIn(DUBAI);

    expect([value.hour, value.minute]).toEqual([0, 0]);
    expect(new Date(value.toAbsoluteString()).toISOString()).toBe(
      new Date(Date.UTC(value.year, value.month - 1, value.day) - 4 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('refuses nothing for an unknown zone, because the caller only offers real ones', () => {
    // A throw here would take the whole form down.
    expect(placeholderIn('Not/AZone').timeZone).toBe('UTC');
  });
});
