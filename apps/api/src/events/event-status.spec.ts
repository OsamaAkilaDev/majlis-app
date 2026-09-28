import { describe, expect, it } from 'vitest';
import { UnprocessableError } from '../common/problem/domain-error';
import { CHAIN, assertTransition, dueStatus } from './event-status';

const AT = (iso: string) => new Date(iso);

function anEvent(status: Parameters<typeof dueStatus>[0]['status']) {
  return {
    status,
    registrationClosesAt: AT('2026-10-01T10:00:00Z'),
    startsAt: AT('2026-10-01T11:00:00Z'),
    endsAt: AT('2026-10-01T15:00:00Z'),
  };
}

describe('assertTransition', () => {
  it('allows exactly one step forward along the chain', () => {
    for (let i = 0; i < CHAIN.length - 1; i += 1) {
      expect(() => assertTransition(CHAIN[i]!, CHAIN[i + 1]!)).not.toThrow();
    }
  });

  it('refuses a skipped step, a step backwards, and a repeat of the current state', () => {
    // Catches a membership check where adjacency is required.
    expect(() => assertTransition('DRAFT', 'ONGOING')).toThrow(UnprocessableError);
    expect(() => assertTransition('ONGOING', 'PUBLISHED')).toThrow(UnprocessableError);
    expect(() => assertTransition('PUBLISHED', 'PUBLISHED')).toThrow(UnprocessableError);
  });

  it('refuses every transition out of CANCELLED and CERTIFIED', () => {
    expect(() => assertTransition('CANCELLED', 'PUBLISHED')).toThrow('That event was cancelled.');
    expect(() => assertTransition('CERTIFIED', 'CANCELLED')).toThrow(
      'That event has issued certificates and is final.',
    );
  });

  it('allows any chain state to be cancelled', () => {
    for (const from of CHAIN) {
      if (from === 'CERTIFIED') continue;
      expect(() => assertTransition(from, 'CANCELLED')).not.toThrow();
    }
  });
});

describe('dueStatus', () => {
  it('reads the newest boundary that has passed, not the first one', () => {
    // Both boundaries have passed; checking the earliest first would never open check-in.
    expect(dueStatus(anEvent('PUBLISHED'), AT('2026-10-01T11:30:00Z'))).toBe('ONGOING');
    expect(dueStatus(anEvent('PUBLISHED'), AT('2026-10-01T16:00:00Z'))).toBe('COMPLETED');
  });

  it('keeps a live event ONGOING when registration closes part-way through it', () => {
    // Registration closes after start here, so ordering by timestamp would shut check-in mid-event.
    const event = { ...anEvent('PUBLISHED'), registrationClosesAt: AT('2026-10-01T14:00:00Z') };
    expect(dueStatus(event, AT('2026-10-01T14:30:00Z'))).toBe('ONGOING');
  });

  it('opens at the start instant and stays open until the event has ended', () => {
    expect(dueStatus(anEvent('PUBLISHED'), AT('2026-10-01T09:59:59Z'))).toBe('PUBLISHED');
    expect(dueStatus(anEvent('PUBLISHED'), AT('2026-10-01T10:00:00Z'))).toBe('REGISTRATION_CLOSED');
    expect(dueStatus(anEvent('PUBLISHED'), AT('2026-10-01T10:59:59Z'))).toBe('REGISTRATION_CLOSED');
    expect(dueStatus(anEvent('PUBLISHED'), AT('2026-10-01T11:00:00Z'))).toBe('ONGOING');
    expect(dueStatus(anEvent('PUBLISHED'), AT('2026-10-01T15:00:00Z'))).toBe('ONGOING');
    expect(dueStatus(anEvent('PUBLISHED'), AT('2026-10-01T15:00:01Z'))).toBe('COMPLETED');
  });

  it('never time-advances DRAFT, CANCELLED or CERTIFIED', () => {
    // Otherwise an advance would publish drafts and drag cancelled events through the chain.
    for (const status of ['DRAFT', 'CANCELLED', 'CERTIFIED'] as const) {
      expect(dueStatus(anEvent(status), AT('2026-10-01T16:00:00Z'))).toBe(status);
    }
  });
});
