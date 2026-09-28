import { z } from 'zod';
import { listSchema } from '../common/list';

/** A closed enum: the inbox and the email layer both render per type, so an unknown value fails at the boundary. */
export const notificationTypeSchema = z.enum([
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

/**
 * Only ids and display strings: no email, no token, nothing a log would redact.
 * `auth.password_reset` is excluded from GET /me/notifications, as a reset request is not an inbox item.
 */
export const notificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const notificationListSchema = listSchema(notificationSchema);

/** Tri-state: absent is "no filter". `z.coerce.boolean()` would collapse that and turn 'false' into true. */
export const notificationListQuerySchema = z.object({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationList = z.infer<typeof notificationListSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
