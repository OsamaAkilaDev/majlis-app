import { describe, expect, it } from 'vitest';
import { emailSchema, loginBodySchema, signupBodySchema } from './index';

describe('emailSchema', () => {
  it('trims before validating format', () => {
    // Catches `z.email().trim()`, where the format check runs on the untrimmed string.
    expect(emailSchema.parse('  Foo@Bar.com  ')).toBe('foo@bar.com');
  });

  it('lowercases so the CHECK (email = lower(email)) constraint is never hit un-normalised', () => {
    expect(emailSchema.parse('Osama@UNI.ac.ae')).toBe('osama@uni.ac.ae');
  });

  it('rejects a string with no @ even after trimming', () => {
    expect(emailSchema.safeParse('  not-an-email  ').success).toBe(false);
  });
});

describe('signupBodySchema', () => {
  it('rejects a password shorter than 12 characters', () => {
    expect(
      signupBodySchema.safeParse({ email: 'a@uni.ac.ae', password: 'short11!', fullName: 'A' }).success,
    ).toBe(false);
  });

  it('accepts a valid signup body and normalises the email', () => {
    const parsed = signupBodySchema.parse({
      email: ' A@Uni.ac.ae ',
      password: 'correct-horse-battery',
      fullName: 'A Student',
    });
    expect(parsed.email).toBe('a@uni.ac.ae');
  });

  it('rejects a blank fullName', () => {
    expect(
      signupBodySchema.safeParse({ email: 'a@uni.ac.ae', password: 'correct-horse-battery', fullName: '' })
        .success,
    ).toBe(false);
  });
});

describe('loginBodySchema', () => {
  it('shares emailSchema with signup: the same normalisation applies to the lookup side', () => {
    const parsed = loginBodySchema.parse({ email: 'Osama@UNI.ac.ae', password: 'anything' });
    expect(parsed.email).toBe('osama@uni.ac.ae');
  });
});
