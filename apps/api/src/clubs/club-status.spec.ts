import { describe, expect, it } from 'vitest';
import { assertAcceptsEdits, assertAcceptsNewActivity, assertTransition } from './club-status';

describe('assertTransition', () => {
  it('allows ACTIVE and SUSPENDED in both directions', () => {
    expect(() => assertTransition('ACTIVE', 'SUSPENDED')).not.toThrow();
    expect(() => assertTransition('SUSPENDED', 'ACTIVE')).not.toThrow();
  });

  it('allows archiving from either live state', () => {
    expect(() => assertTransition('ACTIVE', 'ARCHIVED')).not.toThrow();
    expect(() => assertTransition('SUSPENDED', 'ARCHIVED')).not.toThrow();
  });

  it('allows leaving ARCHIVED for either live state', () => {
    // Archiving is reversible by decision, so a misclick is never stranded.
    expect(() => assertTransition('ARCHIVED', 'ACTIVE')).not.toThrow();
    expect(() => assertTransition('ARCHIVED', 'SUSPENDED')).not.toThrow();
  });

  it('refuses a no-op transition from every state', () => {
    // Every state: the no-op guard is the only rule the fully-connected table does not cover.
    expect(() => assertTransition('ACTIVE', 'ACTIVE')).toThrow();
    expect(() => assertTransition('SUSPENDED', 'SUSPENDED')).toThrow();
    expect(() => assertTransition('ARCHIVED', 'ARCHIVED')).toThrow();
  });
});

describe('activity gates', () => {
  it('blocks new activity in a suspended club but still allows edits', () => {
    // Catches one combined gate: suspended freezes new activity but still allows editing.
    expect(() => assertAcceptsNewActivity('SUSPENDED')).toThrow();
    expect(() => assertAcceptsEdits('SUSPENDED')).not.toThrow();
  });

  it('blocks both in an archived club', () => {
    expect(() => assertAcceptsNewActivity('ARCHIVED')).toThrow();
    expect(() => assertAcceptsEdits('ARCHIVED')).toThrow();
  });

  it('allows both in an active club', () => {
    expect(() => assertAcceptsNewActivity('ACTIVE')).not.toThrow();
    expect(() => assertAcceptsEdits('ACTIVE')).not.toThrow();
  });
});
