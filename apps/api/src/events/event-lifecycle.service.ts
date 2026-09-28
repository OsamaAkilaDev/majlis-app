import { Injectable } from '@nestjs/common';
import type { EventStatus } from '@majlis/contracts';
import { AuditService } from '../audit/audit.service';
import { NotFoundError } from '../common/problem/domain-error';
import { TransactionHost } from '../prisma/transaction.host';
import { CHAIN, assertTransition, dueStatus, type DueStatusInput } from './event-status';
import { assertRegistrationTransition } from './registration-status';

// Scalars only: a relation here would be a second statement.
const LIFECYCLE_SELECT = {
  id: true,
  clubId: true,
  status: true,
  startsAt: true,
  endsAt: true,
  registrationClosesAt: true,
} as const;

export type LifecycleRow = DueStatusInput & {
  id: string;
  clubId: string;
};

function chainIndex(status: EventStatus): number {
  return (CHAIN as readonly EventStatus[]).indexOf(status);
}

// Every clock-driven event transition happens here and nowhere else.
@Injectable()
export class EventLifecycleService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
  ) {}

  /** Call BEFORE opening your own transaction, or a later refusal rolls the advance back too. */
  async advance(eventId: string): Promise<EventStatus> {
    return (await this.advanceAndRead(eventId)).status;
  }

  /** Same rule as `advance()`: never call inside your own transaction. */
  async advanceAndRead(eventId: string): Promise<LifecycleRow> {
    const now = new Date();
    const event = await this.host.tx.event.findUnique({
      where: { id: eventId },
      select: LIFECYCLE_SELECT,
    });
    if (!event) throw new NotFoundError('No such event.');

    // Checked outside a transaction: almost no read has a hop due.
    if (dueStatus(event, now) === event.status) return event;

    return this.host.run(async () => {
      // Re-read in case a concurrent advance committed; each hop's conditional update catches the rest.
      const fresh = await this.host.tx.event.findUnique({
        where: { id: eventId },
        select: LIFECYCLE_SELECT,
      });
      if (!fresh) throw new NotFoundError('No such event.');
      return { ...fresh, status: await this.advanceRow(fresh, now) };
    });
  }

  private async advanceRow(event: LifecycleRow, now: Date): Promise<EventStatus> {
    const due = dueStatus(event, now);
    let current = event.status;

    // Forward only: a rescheduled event must not leave COMPLETED once attendance was taken.
    while (chainIndex(due) > chainIndex(current)) {
      const next = CHAIN[chainIndex(current) + 1]!;
      assertTransition(current, next);

      // Conditional, or a stale reader replays the walk and the status goes backwards.
      const { count } = await this.host.tx.event.updateMany({
        where: { id: event.id, status: current },
        data: { status: next },
      });
      if (count === 0) break;

      // CONFIRMED only: WAITLISTED never held a seat and would inflate `expected`.
      if (next === 'COMPLETED') assertRegistrationTransition('CONFIRMED', 'NO_SHOW');
      const noShow =
        next === 'COMPLETED'
          ? (
              await this.host.tx.eventRegistration.updateMany({
                where: { eventId: event.id, status: 'CONFIRMED' },
                data: { status: 'NO_SHOW' },
              })
            ).count
          : 0;

      await this.audit.record({
        action: 'event.status_advanced',
        entityType: 'Event',
        entityId: event.id,
        before: { status: current },
        after: { status: next, ...(next === 'COMPLETED' ? { noShow } : {}) },
      });
      current = next;
    }

    return current;
  }
}
