import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN } from '@majlis/contracts/constants';
import { passwordStrength, STRENGTH_STEPS } from './password-strength';

describe('passwordStrength', () => {
  it('shows the rule, not a grade, until the rule is met', () => {
    expect(passwordStrength('').label).toBe(`${PASSWORD_MIN}+ characters`);
    expect(passwordStrength('short').met).toBe(false);
    expect(passwordStrength('a'.repeat(PASSWORD_MIN - 1)).met).toBe(false);
  });

  it('fills nothing for an empty field and something for a partial one', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('a').score).toBeGreaterThan(0);
  });

  it('grades a long passphrase above a short dense one', () => {
    // A meter weighted on variety over length ranks these the other way round.
    const passphrase = passwordStrength('correct horse battery staple');
    const dense = passwordStrength('Passw0rd!aB1');

    expect(passphrase.met && dense.met).toBe(true);
    expect(passphrase.score).toBeGreaterThan(dense.score);
  });

  it('refuses to call a long repetitive password strong', () => {
    const repeated = passwordStrength('ababababababababababababab');

    expect(repeated.met).toBe(true);
    expect(repeated.score).toBe(1);
    expect(repeated.label).toBe('Weak');
  });

  it('never exceeds the number of segments the meter draws', () => {
    const best = passwordStrength(`A-very-long-one-with-everything-in-it-0123456789`);

    expect(best.score).toBe(STRENGTH_STEPS);
    expect(best.label).toBe('Strong');
  });
});

describe('the digit class', () => {
  // Catches `/d/`, which matches the letter d, in place of `\d`.
  it('counts digits, not the letter d', () => {
    // Lower, upper and digits with no `d` and no symbol.
    expect(passwordStrength('Quiet7Morning9Sky').score).toBe(3);
  });

  it('does not credit a d as a digit', () => {
    // No space: it would satisfy the symbol class and score 3 either way.
    expect(passwordStrength('AddendumHandle').score).toBe(2);
  });
});
