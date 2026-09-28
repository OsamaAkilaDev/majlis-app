import { describe, expect, it } from 'vitest';
import { notificationListQuerySchema, notificationSchema, notificationTypeSchema } from './index';

describe('notificationTypeSchema', () => {
  it('covers every notification the product sends, plus the password reset', () => {
    // Pinned explicitly, so a type dropped silently is caught.
    expect(notificationTypeSchema.options).toEqual([
      'team.invited',
      'membership.decided',
      'event.published',
      'registration.confirmed',
      'registration.waitlisted',
      'registration.promoted',
      'event.changed',
      'event.cancelled',
      'certificate.issued',
      'certificate.revoked',
      'auth.password_reset',
    ]);
  });

  it('rejects a type outside the list', () => {
    expect(() => notificationTypeSchema.parse('event.exploded')).toThrow();
  });
});

describe('notificationListQuerySchema', () => {
  it('leaves unread undefined when absent, so no filter is applied', () => {
    expect(notificationListQuerySchema.parse({}).unread).toBeUndefined();
  });

  it('reads unread=true as true', () => {
    expect(notificationListQuerySchema.parse({ unread: 'true' }).unread).toBe(true);
  });

  it('reads unread=false as false, not as the truthiness of a non-empty string', () => {
    // z.coerce.boolean() would answer true, returning exactly the rows ?unread=false excludes.
    expect(notificationListQuerySchema.parse({ unread: 'false' }).unread).toBe(false);
  });

  it('rejects a value that is neither', () => {
    expect(() => notificationListQuerySchema.parse({ unread: 'yes' })).toThrow();
  });
});

describe('notificationSchema', () => {
  it('accepts a row with an unread readAt', () => {
    const parsed = notificationSchema.parse({
      id: '0199a0a0-0000-7000-8000-000000000000',
      type: 'registration.confirmed',
      payload: { eventId: 'e1', eventTitle: 'Drone Build Night' },
      readAt: null,
      createdAt: '2026-09-13T10:00:00.000Z',
    });
    expect(parsed.payload.eventTitle).toBe('Drone Build Night');
  });

  it('rejects a row whose type is not a known trigger', () => {
    expect(() =>
      notificationSchema.parse({
        id: '0199a0a0-0000-7000-8000-000000000000',
        type: 'something.else',
        payload: {},
        readAt: null,
        createdAt: '2026-09-13T10:00:00.000Z',
      }),
    ).toThrow();
  });
});
