import { PASSWORD_MIN } from '@majlis/contracts/constants';

export const STRENGTH_STEPS = 4;

export type PasswordStrength = {
  score: number;
  label: string;
  met: boolean;
};

const CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];

const GRADES = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

function grade(score: number): string {
  return GRADES[Math.min(Math.max(score, 0), STRENGTH_STEPS) as 0 | 1 | 2 | 3 | 4];
}

/**
 * Advisory, never a gate: the API enforces length only.
 * Length dominates on purpose, so "Passw0rd!" never outscores a long passphrase.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN) {
    return {
      score: password.length === 0 ? 0 : 1,
      label: `${PASSWORD_MIN}+ characters`,
      met: false,
    };
  }

  let score = 1;
  if (password.length >= PASSWORD_MIN + 2) score = 2;
  if (password.length >= PASSWORD_MIN + 6) score = 3;
  if (password.length >= PASSWORD_MIN + 12) score = 4;

  const classes = CLASSES.filter((re) => re.test(password)).length;
  if (classes >= 3) score = Math.min(score + 1, STRENGTH_STEPS);

  // Long but repetitive scores low.
  if (new Set(password).size <= 4) score = 1;

  return { score, label: grade(score), met: true };
}
