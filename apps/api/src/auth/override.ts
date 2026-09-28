import type { TransactionHost } from '../prisma/transaction.host';
import { overrideReasonFor } from './field-permissions';
import type { Actor } from './permissions';
import { resolveClubFacts } from './permissions.guard';

/** Required when an Admin with no role in the club acts in it. Roles re-derived, never taken from the guard. */
export async function clubOverrideReason(
  host: TransactionHost,
  actor: Actor,
  clubId: string,
  reason: string | undefined,
): Promise<string | undefined> {
  const { clubRoles } = await resolveClubFacts(host, actor.id, clubId);
  return overrideReasonFor({ platformRole: actor.platformRole, clubRoles }, reason);
}
