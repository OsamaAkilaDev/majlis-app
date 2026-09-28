import { Injectable } from '@nestjs/common';
import type { AuditEntry, AuditList } from '@majlis/contracts';
import { NotFoundError } from '../common/problem/domain-error';
import type { Prisma, AuditLog } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';

function toEntry(row: AuditLog): AuditEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    outcome: row.outcome,
    reason: row.reason,
    before: row.before ?? null,
    after: row.after ?? null,
    requestId: row.requestId,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  };
}

// No update or delete anywhere: the table is append-only by trigger.
@Injectable()
export class AuditReadService {
  constructor(private readonly host: TransactionHost) {}

  async list(): Promise<AuditList> {
    return this.entries({});
  }

  // AuditLog has no foreign keys, so there is no join to walk.
  async forClub(clubId: string): Promise<AuditList> {
    const club = await this.host.tx.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundError('No such club.');

    const events = await this.host.tx.event.findMany({
      where: { clubId },
      select: { id: true },
    });

    return this.entries({ entityId: { in: [clubId, ...events.map((e) => e.id)] } });
  }

  private async entries(where: Prisma.AuditLogWhereInput): Promise<AuditList> {
    const rows = await this.host.tx.auditLog.findMany({ where, orderBy: { id: 'desc' } });
    return { items: rows.map(toEntry) };
  }
}
