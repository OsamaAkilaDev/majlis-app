import { Injectable } from '@nestjs/common';
import type {
  AssignResponsibilityBody,
  Assignment,
  AssignmentList,
  RemoveAssignmentBody,
} from '@majlis/contracts';
import { AuditService } from '../audit/audit.service';
import { clubOverrideReason } from '../auth/override';
import type { Actor } from '../auth/permissions';
import { WITH_USER } from '../common/with-user';
import { assertAcceptsEdits } from '../clubs/club-status';
import { NotFoundError } from '../common/problem/domain-error';
import { conflictOn } from '../common/prisma-constraint';
import type { EventAssignment as AssignmentRow } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';
import { loadEvent } from './load-event';

type AssignmentWithUser = AssignmentRow & { user: { fullName: string; email: string } };

function toAssignment(row: AssignmentWithUser): Assignment {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    userFullName: row.user.fullName,
    userEmail: row.user.email,
    responsibility: row.responsibility,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
  ) {}

  async list(eventId: string): Promise<AssignmentList> {
    await loadEvent(this.host, eventId);
    const rows = await this.host.tx.eventAssignment.findMany({
      where: { eventId },
      orderBy: { id: 'asc' },
      include: WITH_USER,
    });

    return { items: rows.map(toAssignment) };
  }

  async assign(
    actor: Actor,
    eventId: string,
    body: AssignResponsibilityBody,
  ): Promise<Assignment> {
    return this.host.run(async () => {
      const event = await loadEvent(this.host, eventId);
      assertAcceptsEdits(event.club.status);
      const reason = await clubOverrideReason(this.host, actor, event.clubId, body.overrideReason);

      const row = await this.host.tx.eventAssignment
        .create({
          data: {
            eventId,
            userId: body.userId,
            responsibility: body.responsibility,
            assignedById: actor.id,
          },
          include: WITH_USER,
        })
        .catch(
          conflictOn({
            event_assignment: 'That person already holds that responsibility on this event.',
          }),
        );

      await this.audit.record({
        action: 'event.responsibility_assigned',
        entityType: 'EventAssignment',
        entityId: row.id,
        actorUserId: actor.id,
        reason,
        after: { eventId, userId: row.userId, responsibility: row.responsibility },
      });

      return toAssignment(row);
    });
  }

  // Loaded by `{ id, eventId }`, so an id from another event is a 404.
  async remove(
    actor: Actor,
    eventId: string,
    assignmentId: string,
    body: RemoveAssignmentBody,
  ): Promise<void> {
    return this.host.run(async () => {
      const event = await loadEvent(this.host, eventId);
      const existing = await this.host.tx.eventAssignment.findFirst({
        where: { id: assignmentId, eventId },
      });
      if (!existing) throw new NotFoundError('No such assignment.');
      const reason = await clubOverrideReason(this.host, actor, event.clubId, body.overrideReason);

      await this.host.tx.eventAssignment.delete({ where: { id: existing.id } });
      await this.audit.record({
        action: 'event.responsibility_removed',
        entityType: 'EventAssignment',
        entityId: existing.id,
        actorUserId: actor.id,
        reason,
        before: {
          eventId,
          userId: existing.userId,
          responsibility: existing.responsibility,
        },
      });
    });
  }
}
