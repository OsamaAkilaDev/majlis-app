'use client';

import type { Notification, NotificationList } from '@majlis/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { problemMessage } from '@/lib/api';
import { Moment } from '@/components/LocalTime';
import { notificationLine } from '@/lib/notification-line';
import { listNotifications, markNotificationRead } from '@/lib/notifications';
import { useList } from '@/lib/use-list';

export function Inbox({ initial }: { initial: NotificationList | null }) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { items, setItems } = useList(
    initial,
    () => listNotifications({ unread: unreadOnly ? true : undefined }),
    { deps: [unreadOnly] },
  );

  /** Optimistic, rolled back on failure. */
  async function markRead(notification: Notification) {
    const previous = items;
    setError(null);
    setItems(
      (rows) =>
        rows?.map((row) =>
          row.id === notification.id ? { ...row, readAt: new Date().toISOString() } : row,
        ) ?? null,
    );

    try {
      // apiFetch refreshes the page on success, which updates the badge count.
      await markNotificationRead(notification.id);
    } catch (err) {
      setItems(previous);
      setError(problemMessage(err, 'That did not save.'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant={unreadOnly ? 'default' : 'outline'}
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly((on) => !on)}
        >
          Unread
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-bad-fg">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={unreadOnly ? 'Nothing unread' : 'Nothing yet'} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((notification) => {
              const { title, detail, href } = notificationLine(notification);
              const unread = notification.readAt === null;

              return (
                <li
                  key={notification.id}
                  className={
                    unread
                      ? 'flex items-start gap-3 rounded-card border border-border border-l-[3px] border-l-primary bg-surface p-3'
                      : 'flex items-start gap-3 rounded-card border border-border bg-bg p-3'
                  }
                >
                  <span
                    aria-hidden
                    className={
                      unread
                        ? 'mt-1.5 size-2 shrink-0 rounded-full bg-primary'
                        : 'mt-1.5 size-2 shrink-0 rounded-full border border-border-control'
                    }
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={
                        unread
                          ? 'truncate font-semibold text-ink'
                          : 'truncate font-normal text-ink-2'
                      }
                    >
                      {unread ? <span className="sr-only">Unread. </span> : null}
                      {href ? (
                        <Link
                          href={href}
                          className="hover:underline"
                          onClick={() => {
                            if (unread) void markRead(notification);
                          }}
                        >
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                    </span>
                    <span className="text-sm text-ink-2">{detail}</span>
                    <span className="tabular text-label text-ink-3">
                      <Moment at={notification.createdAt} />
                    </span>
                  </div>

                  {unread ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markRead(notification)}
                      aria-label={`Mark ${title} read`}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
