import { Injectable } from '@nestjs/common';
import { TransactionHost } from '../prisma/transaction.host';
import { RequestContext } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  /** Defaults to SUCCESS; only the permissions guard writes DENIED. */
  outcome?: 'SUCCESS' | 'DENIED';
  reason?: string;
  before?: unknown;
  after?: unknown;
  actorUserId?: string;
}

/** Writes through host.tx, so the audit row always joins the caller's transaction. */
@Injectable()
export class AuditService {
  constructor(
    private readonly host: TransactionHost,
    private readonly context: RequestContext,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const facts = this.context.current;

    // `== null` so an explicit null also becomes SQL NULL; a bare JS null is not a valid Json input.
    await this.host.tx.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        outcome: entry.outcome ?? 'SUCCESS',
        reason: entry.reason ?? null,
        before: entry.before == null ? Prisma.DbNull : (entry.before as Prisma.InputJsonValue),
        after: entry.after == null ? Prisma.DbNull : (entry.after as Prisma.InputJsonValue),
        requestId: facts?.requestId ?? 'unknown',
        ip: facts?.ip ?? null,
      },
    });
  }
}
