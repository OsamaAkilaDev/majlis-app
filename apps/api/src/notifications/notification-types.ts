import type { NotificationType } from '@majlis/contracts';

/** A retry lands on the same dedupe key, which the unique index absorbs. `payload` holds nothing to redact. */
export interface NotificationEntry {
  userId: string;
  type: NotificationType;
  subject: string;
  payload: Record<string, unknown>;
  // Only for the password reset, delivered inline. Absent, it is sent after commit.
  delivered?: { status: 'SENT' | 'SKIPPED' | 'FAILED'; error?: string };
}

// One composer, or two call sites building it differently double-notify.
export function dedupeKeyFor(type: NotificationType, subject: string): string {
  return `${type}:${subject}`;
}

// Excluded from the inbox.
export const PASSWORD_RESET_TYPE = 'auth.password_reset' satisfies NotificationType;
