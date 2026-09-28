import { Injectable } from '@nestjs/common';
import type {
  PatchMeBody,
  PatchUserBody,
  PatchUserStatusBody,
  UserList,
  UserListQuery,
  UserProfile,
  UserSearchQuery,
  UserSearchResult,
} from '@majlis/contracts';
import { AuditService } from '../audit/audit.service';
import { emailConflict } from '../auth/auth.service';
import { ConflictError, NotFoundError, UnprocessableError } from '../common/problem/domain-error';
import { Prisma, type User } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Not `===`: Postgres compares uuids case-insensitively, so an upper-cased own id would slip past. */
function isSelf(actorId: string, targetId: string): boolean {
  return actorId.toLowerCase() === targetId.toLowerCase();
}

/** Suspended admins cannot sign in, so they must not count toward the last-admin guard. */
const ACTIVE_ADMIN = { platformRole: 'ADMIN', status: 'ACTIVE' } as const;

const SEARCH_LIMIT = 20;

/** Advisory, because the invariant is a table-wide count: two admins demoting each other lock different rows. */
const ADMIN_COUNT_LOCK_KEY = 8_273_645_522;

// Never the raw row, which holds `password`.
function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    platformRole: user.platformRole,
    status: user.status,
  };
}

/** Allow-listed so a password or future secret column never lands in the append-only audit log. */
const AUDITED_FIELDS = ['fullName', 'email', 'avatarUrl', 'platformRole'] as const;

function pickAudited(user: User, changed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of AUDITED_FIELDS) {
    if (changed.includes(key)) out[key] = user[key];
  }
  return out;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
  ) {}

  me(actor: User): UserProfile {
    return toUserProfile(actor);
  }

  /** Never spread the body into `data`: a client could smuggle in `platformRole`. */
  async updateMe(actor: User, body: PatchMeBody): Promise<UserProfile> {
    const data: { fullName?: string; avatarUrl?: string | null } = {};
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;

    const updated = await this.host.tx.user.update({ where: { id: actor.id }, data });
    return toUserProfile(updated);
  }

  async list(query: UserListQuery): Promise<UserList> {
    const where: Prisma.UserWhereInput = {
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const rows = await this.host.tx.user.findMany({ where, orderBy: { id: 'asc' } });

    return {
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        platformRole: u.platformRole,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  }

  /** Not restricted to club members, since it is for appointing non-members. Three columns only. */
  async search(query: UserSearchQuery): Promise<UserSearchResult> {
    const items = await this.host.tx.user.findMany({
      where: {
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
      // Capped, so it cannot be used to walk the whole directory.
      take: SEARCH_LIMIT,
    });

    return { items };
  }

  async update(actor: User, targetId: string, body: PatchUserBody): Promise<UserProfile> {
    const { reason, ...fields } = body;
    const changing: string[] = Object.keys(fields);
    if (changing.length === 0) {
      throw new UnprocessableError('Nothing to change.');
    }

    const rolePatch = fields.platformRole !== undefined;

    if (rolePatch && isSelf(actor.id, targetId)) {
      throw new UnprocessableError('You cannot change your own platform role.');
    }

    return this.host.run(async () => {
      if (rolePatch) await this.lockAdminCount();
      const before = await this.lockUser(targetId);

      if (rolePatch && before.platformRole === 'ADMIN' && fields.platformRole === 'STUDENT') {
        await this.assertNotLastAdmin();
      }

      const after = await this.host.tx.user
        .update({ where: { id: targetId }, data: fields })
        .catch(emailConflict);

      // A separate action so privilege grants stay filterable in the audit log.
      await this.audit.record({
        action: rolePatch && before.platformRole !== after.platformRole
          ? 'user.role_changed'
          : 'user.updated',
        entityType: 'User',
        entityId: targetId,
        reason,
        actorUserId: actor.id,
        before: pickAudited(before, changing),
        after: pickAudited(after, changing),
      });

      return toUserProfile(after);
    });
  }

  async updateStatus(actor: User, targetId: string, body: PatchUserStatusBody): Promise<UserProfile> {
    const next = body.status;

    return this.host.run(async () => {
      if (isSelf(actor.id, targetId)) {
        throw new UnprocessableError('You cannot change your own account status.');
      }

      // Same lock as demotion, or the two routes together could reach zero admins.
      if (next === 'SUSPENDED') await this.lockAdminCount();

      // Serialises two concurrent suspends so only one writes an audit row.
      const before = await this.lockUser(targetId);
      if (before.status === next) throw new ConflictError('That account is already in that state.');

      if (next === 'SUSPENDED' && before.platformRole === 'ADMIN') await this.assertNotLastAdmin();

      const after = await this.host.tx.user.update({
        where: { id: targetId },
        data: { status: next },
      });

      await this.audit.record({
        action: next === 'SUSPENDED' ? 'user.suspended' : 'user.reinstated',
        entityType: 'User',
        entityId: targetId,
        reason: body.reason,
        actorUserId: actor.id,
        before: { status: before.status },
        after: { status: after.status },
      });

      return toUserProfile(after);
    });
  }

  /** Taken before `lockUser` on every path that can lower the admin count. */
  private async lockAdminCount(): Promise<void> {
    await this.host.tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_COUNT_LOCK_KEY}::bigint)`;
  }

  /** Row-locks the target, then re-reads it under that lock, not before it. */
  private async lockUser(id: string): Promise<User> {
    // A typed call so a malformed id maps to 400 (P2023), not a raw ::uuid cast error.
    if (!UUID_SHAPE.test(id)) await this.host.tx.user.findUniqueOrThrow({ where: { id } });

    // "user" is a reserved word in Postgres and must be quoted.
    const locked = await this.host.tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "user" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError('No such user.');
    return this.host.tx.user.findUniqueOrThrow({ where: { id } });
  }

  /** Only correct under the advisory lock. */
  private async assertNotLastAdmin(): Promise<void> {
    if ((await this.host.tx.user.count({ where: ACTIVE_ADMIN })) <= 1) {
      throw new UnprocessableError('That is the last admin. Appoint another one first.');
    }
  }
}
