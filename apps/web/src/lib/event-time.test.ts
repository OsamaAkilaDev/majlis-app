import { describe, expect, it } from 'vitest';
import { formatChip, formatClock, formatDay, formatMoment, formatRange } from './event-time';

// 2026-09-12T14:00Z is 18:00 in Dubai (+04) and 15:00 in London (BST, +01).
const STARTS = '2026-09-12T14:00:00.000Z';
const ENDS = '2026-09-12T17:00:00.000Z';

describe('formatRange', () => {
  it('renders the wall clock of the zone it is given, not the runtime default', () => {
    expect(formatRange(STARTS, ENDS, 'Asia/Dubai')).toContain('6:00 PM to 9:00 PM');
    expect(formatRange(STARTS, ENDS, 'Europe/London')).toContain('3:00 PM to 6:00 PM');
  });

  it('writes the clock as AM and PM rather than a 24-hour reading', () => {
    // `en-GB` renders lowercase "pm", so the clock is `en-US` and the date is not.
    const morning = formatRange(
      '2026-09-12T05:30:00.000Z',
      '2026-09-12T06:00:00.000Z',
      'Asia/Dubai',
    );
    expect(morning).toContain('9:30 AM to 10:00 AM');
    expect(morning).not.toMatch(/\b(09:30|21:00|pm|am)\b/);
  });

  it('carries the second date only when the event crosses midnight in that zone', () => {
    // 21:00 to 00:30 Dubai: one calendar day in London, two in Dubai.
    const late = { start: '2026-09-12T17:00:00.000Z', end: '2026-09-12T20:30:00.000Z' };
    expect(formatRange(late.start, late.end, 'Asia/Dubai')).toMatch(
      /Sat 12 Sept, 9:00 PM to Sun 13 Sept, 12:30 AM/,
    );
    expect(formatRange(late.start, late.end, 'Europe/London')).toMatch(
      /^Sat 12 Sept, 6:00 PM to 9:30 PM/,
    );
  });

  it('keeps the date day-first, so 9 September is never read as 9 of any other month', () => {
    expect(formatRange(STARTS, ENDS, 'Asia/Dubai')).toMatch(/^Sat 12 Sept/);
  });
});

describe('formatMoment', () => {
  it('names no zone, because the reader is already in it', () => {
    expect(formatMoment(STARTS, 'Asia/Dubai')).toBe('Sat 12 Sept, 6:00 PM');
    expect(formatRange(STARTS, ENDS, 'Europe/London')).toBe('Sat 12 Sept, 3:00 PM to 6:00 PM');
  });
});

describe('formatDay', () => {
  it('renders the UTC day, not the runtime default zone', () => {
    // 22:30Z is already the 14th in Dubai and still the 13th in UTC.
    expect(formatDay('2026-09-13T22:30:00.000Z')).toBe('13 September 2026');
  });

  it('answers the same for either end of a UTC day', () => {
    // A date that differs between server and browser zones is a hydration mismatch.
    expect(formatDay('2026-09-13T23:59:00.000Z')).toBe(formatDay('2026-09-13T00:01:00.000Z'));
  });
});

describe('formatChip and formatClock', () => {
  // 21:30Z on the 12th is 01:30 on the 13th in Dubai.
  const LATE = '2026-09-12T21:30:00.000Z';

  it('dates the chip in the zone it is given', () => {
    expect(formatChip(LATE, 'Asia/Dubai')).toEqual({ month: 'Sept', day: '13' });
    expect(formatChip(LATE, 'Europe/London')).toEqual({ month: 'Sept', day: '12' });
  });

  it('pads the day, so a chip does not jump width between the 9th and the 10th', () => {
    expect(formatChip('2026-09-09T12:00:00.000Z', 'Asia/Dubai').day).toBe('09');
  });

  it('writes the clock 12-hour and in the reader zone', () => {
    expect(formatClock(LATE, 'Asia/Dubai')).toBe('1:30 AM');
    expect(formatClock(LATE, 'Europe/London')).toBe('10:30 PM');
  });
});
