import { describe, expect, it } from 'vitest';
import { barPercents, statusBars } from './chart';

describe('barPercents', () => {
  it('puts the largest value at full width and scales the rest to it', () => {
    expect(barPercents([5, 10, 0])).toEqual([50, 100, 0]);
  });

  it('returns zeros rather than NaN when nothing has been counted', () => {
    // width="NaN%" is dropped silently by SVG, leaving a blank card.
    expect(barPercents([0, 0])).toEqual([0, 0]);
    expect(barPercents([])).toEqual([]);
  });
});

describe('statusBars', () => {
  const label = (s: string) => s.toLowerCase();

  it('orders by the canonical list, not by the object keys', () => {
    // Object.keys order is the database's and shifts as rows are written.
    expect(statusBars({ PENDING: 1, ACTIVE: 4 }, ['ACTIVE', 'PENDING'], label)).toEqual([
      { label: 'active', value: 4 },
      { label: 'pending', value: 1 },
    ]);
  });

  it('keeps a status the order does not name, rather than dropping it', () => {
    // Catches a map over `order` alone, which drops a new enum value.
    expect(statusBars({ ACTIVE: 1, ARCHIVED: 2 }, ['ACTIVE'], label)).toEqual([
      { label: 'active', value: 1 },
      { label: 'archived', value: 2 },
    ]);
  });
});
