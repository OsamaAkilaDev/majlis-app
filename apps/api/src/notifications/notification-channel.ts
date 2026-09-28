import type { NotificationType } from '@majlis/contracts';

/** No row id: a password reset is delivered from a payload that belongs to no row. */
export interface DeliverableNotification {
  type: NotificationType;
  payload: Record<string, unknown>;
  recipientEmail: string;
  recipientName: string;
}

export type DeliveryOutcome =
  | { status: 'SENT' }
  | { status: 'SKIPPED' }
  | { status: 'FAILED'; error: string };

export interface NotificationChannel {
  deliver(notification: DeliverableNotification): Promise<DeliveryOutcome>;
}

/** An interface has no runtime value for Nest to resolve. */
export const NOTIFICATION_CHANNEL = 'NOTIFICATION_CHANNEL';
