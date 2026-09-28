import type { EventDetail } from '@majlis/contracts';
import { describe, expect, it } from 'vitest';
import { decide } from './RegisterControl';

const NOW = new Date('2026-10-01T12:00:00Z');

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    status: 'PUBLISHED',
    viewerRegistrationStatus: null,
    registrationOpensAt: '2026-09-20T00:00:00Z',
    registrationClosesAt: '2026-10-05T00:00:00Z',
    capacity: 10,
    confirmedCount: 0,
    waitlistEnabled: false,
    ...overrides,
  } as EventDetail;
}

describe('decide', () => {
  it('offers nothing once the event itself is over or off', () => {
    for (const status of ['CANCELLED', 'ONGOING', 'COMPLETED', 'CERTIFIED'] as const) {
      expect(decide(event({ status }), NOW).kind).toBe('none');
    }
  });

  it('names the refusal on a live event, where the reason is the news', () => {
    expect(decide(event({ confirmedCount: 10 }), NOW)).toEqual({
      kind: 'refused',
      why: 'This event is full and has no waitlist',
    });
    expect(decide(event({ registrationClosesAt: '2026-09-30T00:00:00Z' }), NOW)).toEqual({
      kind: 'refused',
      why: 'Registration has closed',
    });
  });

  it('still lets a holder cancel while registration can change', () => {
    expect(decide(event({ viewerRegistrationStatus: 'CONFIRMED' }), NOW).kind).toBe('cancel');
  });
});
