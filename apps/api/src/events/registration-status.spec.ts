import { describe, expect, it } from 'vitest';
import { UnprocessableError } from '../common/problem/domain-error';
import { assertRegistrationTransition } from './registration-status';

describe('assertRegistrationTransition', () => {
  it('allows the writes the product makes', () => {
    expect(() => assertRegistrationTransition('CONFIRMED', 'CANCELLED')).not.toThrow();
    expect(() => assertRegistrationTransition('WAITLISTED', 'CANCELLED')).not.toThrow();
    expect(() => assertRegistrationTransition('WAITLISTED', 'CONFIRMED')).not.toThrow();
    expect(() => assertRegistrationTransition('CONFIRMED', 'CHECKED_IN')).not.toThrow();
    expect(() => assertRegistrationTransition('CONFIRMED', 'NO_SHOW')).not.toThrow();
    expect(() => assertRegistrationTransition('NO_SHOW', 'CHECKED_IN')).not.toThrow();
    expect(() => assertRegistrationTransition('CHECKED_IN', 'CONFIRMED')).not.toThrow();
  });

  it('lets a correction re-assert the status a registration already holds', () => {
    // A retried correction lands on the same answer rather than a refusal.
    expect(() => assertRegistrationTransition('CHECKED_IN', 'CHECKED_IN')).not.toThrow();
    expect(() => assertRegistrationTransition('NO_SHOW', 'NO_SHOW')).not.toThrow();
  });

  it('refuses resurrecting a withdrawn registration', () => {
    // Catches a CANCELLED or REMOVED row made certificate-eligible.
    expect(() => assertRegistrationTransition('CANCELLED', 'CHECKED_IN')).toThrow(UnprocessableError);
    expect(() => assertRegistrationTransition('REMOVED', 'CONFIRMED')).toThrow(UnprocessableError);
  });

  it('refuses checking in a waitlisted student, who holds no seat', () => {
    // Catches a CHECKED_IN that never incremented confirmed_count.
    expect(() => assertRegistrationTransition('WAITLISTED', 'CHECKED_IN')).toThrow(UnprocessableError);
  });

  it('refuses cancelling once attendance has been taken', () => {
    expect(() => assertRegistrationTransition('CHECKED_IN', 'CANCELLED')).toThrow(UnprocessableError);
  });
});
