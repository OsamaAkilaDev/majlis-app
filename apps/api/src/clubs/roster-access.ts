import { evaluate, type Permission, type Actor } from '../auth/permissions';
import { resolveClubFacts } from '../auth/permissions.guard';
import { ForbiddenError, NotFoundError } from '../common/problem/domain-error';
import type { TransactionHost } from '../prisma/transaction.host';

/** Only a club's own officers and Admin may read it while it is not ACTIVE. */
export async function canReadInactiveClub(
  host: TransactionHost,
  actor: Actor,
  clubId: string,
): Promise<boolean> {
  if (actor.platformRole === 'ADMIN') return true;

  const appointment = await host.tx.clubTeamAppointment.findFirst({
    where: { clubId, userId: actor.id, status: 'ACTIVE' },
    select: { id: true },
  });
  return appointment !== null;
}

/** An ACTIVE club's rosters are open to anyone signed in; otherwise officers and Admin only. */
export async function assertCanReadRoster(
  host: TransactionHost,
  actor: Actor,
  clubId: string,
): Promise<void> {
  const club = await host.tx.club.findUnique({ where: { id: clubId }, select: { status: true } });
  if (!club) throw new NotFoundError('No such club.');
  if (club.status === 'ACTIVE') return;

  if (!(await canReadInactiveClub(host, actor, clubId))) {
    throw new ForbiddenError('You do not have permission to do that.');
  }
}

/** Roster emails need an officer permission, re-derived here because the routes require none. */
export async function canReadRosterEmail(
  host: TransactionHost,
  actor: Actor,
  clubId: string,
  permission: Permission,
): Promise<boolean> {
  const { clubRoles } = await resolveClubFacts(host, actor.id, clubId);
  return evaluate(permission, {
    userId: actor.id,
    platformRole: actor.platformRole,
    clubRoles,
    eventResponsibilities: [],
  });
}
