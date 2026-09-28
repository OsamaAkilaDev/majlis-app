import { Inject, Injectable } from '@nestjs/common';
import type { Notification, NotificationListQuery, NotificationList } from '@majlis/contracts';
import { Logger } from 'nestjs-pino';
import { NotFoundError } from '../common/problem/domain-error';
import type { Prisma, Notification as NotificationRow } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';
import {
  NOTIFICATION_CHANNEL,
  type DeliverableNotification,
  type DeliveryOutcome,
  type NotificationChannel,
} from './notification-channel';
import { PASSWORD_RESET_TYPE, dedupeKeyFor, type NotificationEntry } from './notification-types';

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    // A renamed type fails the response schema rather than being reshaped here.
    type: row.type as Notification['type'],
    payload: (row.payload ?? {}) as Record<string, unknown>,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Rows join the caller's transaction; email goes out after commit, so a failed send rolls nothing back. */
@Injectable()
export class NotificationService {
  constructor(
    private readonly host: TransactionHost,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
    private readonly logger: Logger,
  ) {}

  record(entry: NotificationEntry): Promise<number> {
    return this.recordMany([entry]);
  }

  /** `skipDuplicates`, not catching P2002: a violation aborts the caller's whole transaction. */
  async recordMany(entries: NotificationEntry[]): Promise<number> {
    if (entries.length === 0) return 0;

    const created = await this.host.tx.notification.createManyAndReturn({
      data: entries.map((e) => ({
        userId: e.userId,
        type: e.type,
        dedupeKey: dedupeKeyFor(e.type, e.subject),
        payload: e.payload as Prisma.InputJsonValue,
        ...(e.delivered
          ? { emailStatus: e.delivered.status, emailError: e.delivered.error ?? null }
          : {}),
      })),
      skipDuplicates: true,
      select: { id: true, emailStatus: true },
    });

    // Only rows actually inserted: a deduplicated retry must not send twice.
    const pending = created.filter((n) => n.emailStatus === 'PENDING').map((n) => n.id);
    if (pending.length > 0) {
      this.host.afterCommit(() => {
        this.deliver(pending).catch((err: unknown) =>
          this.logger.error({ err, ids: pending }, 'Notification delivery failed'),
        );
      });
    }
    return created.length;
  }

  async list(actor: { id: string }, query: NotificationListQuery): Promise<NotificationList> {
    const rows = await this.host.tx.notification.findMany({
      where: {
        userId: actor.id,
        type: { not: PASSWORD_RESET_TYPE },
        ...(query.unread === undefined ? {} : query.unread ? { readAt: null } : { readAt: { not: null } }),
      },
      orderBy: { id: 'desc' },
    });

    return { items: rows.map(toNotification) };
  }

  // Not found rather than forbidden: a 403 would confirm the id exists.
  async markRead(actor: { id: string }, id: string): Promise<Notification> {
    const row = await this.host.tx.notification.findFirst({
      where: { id, userId: actor.id, type: { not: PASSWORD_RESET_TYPE } },
    });
    if (!row) throw new NotFoundError('No such notification.');
    if (row.readAt) return toNotification(row);

    const read = await this.host.tx.notification.update({
      where: { id: row.id },
      data: { readAt: new Date() },
    });
    return toNotification(read);
  }

  /** No transaction: a send cannot be rolled back and would pin a connection across HTTP. */
  private async deliver(ids: string[]): Promise<void> {
    const rows = await this.host.tx.notification.findMany({
      where: { id: { in: ids } },
      include: { user: { select: { email: true, fullName: true } } },
    });

    for (const row of rows) {
      const outcome = await this.deliverNow({
        type: row.type as Notification['type'],
        payload: (row.payload ?? {}) as Record<string, unknown>,
        recipientEmail: row.user.email,
        recipientName: row.user.fullName,
      });
      // updateMany: a row deleted mid-send is a no-op rather than an error.
      await this.host.tx.notification.updateMany({
        where: { id: row.id },
        data: {
          emailStatus: outcome.status,
          emailError: outcome.status === 'FAILED' ? outcome.error : null,
        },
      });
    }
  }

  /** Persists nothing, so the reset link (a live credential) never lands in a payload. Never throws. */
  async deliverNow(notification: DeliverableNotification): Promise<DeliveryOutcome> {
    try {
      return await this.channel.deliver(notification);
    } catch (e) {
      // The message only: this is stored and shown to an Admin, and a stack can carry a request.
      return { status: 'FAILED', error: e instanceof Error ? e.message : String(e) };
    }
  }
}
