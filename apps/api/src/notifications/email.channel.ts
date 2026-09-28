import { renderNotificationEmail } from './emails/templates';
import type {
  DeliverableNotification,
  DeliveryOutcome,
  NotificationChannel,
} from './notification-channel';

export class EmailChannel implements NotificationChannel {
  constructor(private readonly webOrigin: string) {}

  async deliver(notification: DeliverableNotification): Promise<DeliveryOutcome> {
    const { subject, html } = await renderNotificationEmail(notification.type, {
      recipientName: notification.recipientName,
      payload: notification.payload,
      webOrigin: this.webOrigin,
    });

    // Here goes the email sending request
    void subject;
    void html;

    return { status: 'SKIPPED' };
  }
}
