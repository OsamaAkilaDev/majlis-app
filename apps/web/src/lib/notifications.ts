import type { Notification, NotificationListQuery, NotificationList } from '@majlis/contracts';
import { apiFetch, qs } from './api';

export const listNotifications = (query: NotificationListQuery): Promise<NotificationList> =>
  apiFetch(`/me/notifications${qs({ unread: query.unread })}`);

/** Idempotent, so a second press on a row already read answers the same row. */
export const markNotificationRead = (id: string): Promise<Notification> =>
  apiFetch(`/me/notifications/${id}/read`, { method: 'POST' });
