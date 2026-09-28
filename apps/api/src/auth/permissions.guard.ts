import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { ForbiddenError, UnauthorizedError } from '../common/problem/domain-error';
import type { Prisma, User } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';
import { evaluate, type ActorFacts } from './permissions';
import { PERMISSION_KEY, type RequiredPermission, type ScopeSpec } from './require-permission.decorator';

/** ACTIVE appointments only: without the filter an INVITED or DECLINED user would get Lead authority. */
export async function resolveClubFacts(
  host: TransactionHost,
  userId: string,
  clubId: string,
): Promise<Pick<ActorFacts, 'clubRoles'>> {
  return { clubRoles: await activeClubRoles(host, { userId, clubId }) };
}

/** `status` is spread last so no caller's filter can override it. */
async function activeClubRoles(
  host: TransactionHost,
  where: Prisma.ClubTeamAppointmentWhereInput,
): Promise<ActorFacts['clubRoles']> {
  const appointments = await host.tx.clubTeamAppointment.findMany({
    where: { ...where, status: 'ACTIVE' },
    select: { role: true },
  });
  return appointments.map((a) => a.role);
}

/** No status filter: an assignment row is authority the moment it exists. */
export async function resolveEventFacts(
  host: TransactionHost,
  userId: string,
  eventId: string,
): Promise<Pick<ActorFacts, 'eventResponsibilities'>> {
  const assignments = await host.tx.eventAssignment.findMany({
    where: { userId, eventId },
    select: { responsibility: true },
  });
  return { eventResponsibilities: assignments.map((a) => a.responsibility) };
}

/** Reads only the scope identifier, never a role. A missing path means no scope, which denies. */
function readAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function readId(req: Request, path: string | undefined): string | undefined {
  const value = path === undefined ? undefined : readAt(req, path);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const ENTITY_TYPE = {
  club: 'Club',
  event: 'Event',
  certificate: 'Certificate',
  none: 'User',
} as const;

/** Registered after SessionGuard so `req.actor` is set. Re-derives authority from the database every request. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly host: TransactionHost,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true; // authenticated (SessionGuard ran), but unscoped by permission

    const req = ctx.switchToHttp().getRequest<Request>();
    const actor = req.actor;
    if (!actor) throw new UnauthorizedError('Not signed in.');

    const scopeId = readId(req, required.scope?.from);
    const facts = await this.loadFacts(actor, required.scope, scopeId);
    if (evaluate(required.permission, facts)) return true;

    // Own transaction, since the handler's never opens.
    await this.host.run(() =>
      this.audit.record({
        action: 'permission.denied',
        entityType: ENTITY_TYPE[required.scope?.scope ?? 'none'],
        // params.id: best-effort target on a denial with no scope (e.g. `user:suspend`).
        entityId: scopeId ?? readId(req, 'params.id') ?? actor.id,
        outcome: 'DENIED',
        reason: required.permission,
        actorUserId: actor.id,
      }),
    );
    throw new ForbiddenError('You do not have permission to do that.');
  }

  /**
   * Event scope also resolves the event's club roles, or a Lead would be denied on their own club's event.
   * An unresolvable scope id yields no authority: it must deny, never 500.
   */
  async loadFacts(
    actor: User,
    scope: ScopeSpec | undefined,
    scopeId: string | undefined,
  ): Promise<ActorFacts> {
    const base: ActorFacts = {
      userId: actor.id,
      platformRole: actor.platformRole,
      clubRoles: [],
      eventResponsibilities: [],
    };
    if (!scope || !scopeId) return base;

    if (scope.scope === 'club') {
      const { clubRoles } = await resolveClubFacts(this.host, actor.id, scopeId);
      return { ...base, clubRoles };
    }

    // No event assignments: certificates belong to the core team, not door staff.
    if (scope.scope === 'certificate') {
      const clubRoles = await activeClubRoles(this.host, {
        userId: actor.id,
        club: { events: { some: { certificates: { some: { id: scopeId } } } } },
      });
      return { ...base, clubRoles };
    }

    // Parallel is safe only here, before any transaction: inside one they would queue on one connection.
    const [{ eventResponsibilities }, clubRoles] = await Promise.all([
      resolveEventFacts(this.host, actor.id, scopeId),
      activeClubRoles(this.host, { userId: actor.id, club: { events: { some: { id: scopeId } } } }),
    ]);
    return { ...base, clubRoles, eventResponsibilities };
  }
}
