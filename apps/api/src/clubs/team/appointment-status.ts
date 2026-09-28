import { ConflictError, UnprocessableError } from '../../common/problem/domain-error';
import type { Prisma } from '../../generated/prisma/client';
import type { AppointmentStatus } from '../../generated/prisma/enums';
import type { TransactionHost } from '../../prisma/transaction.host';

const ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
  INVITED: ['ACTIVE', 'DECLINED', 'EXPIRED'],
  ACTIVE: ['ENDED'],
  DECLINED: [],
  EXPIRED: [],
  ENDED: [],
};

/** Conditional on the status read, so a stale second write yields a 409, never an overwrite. */
export async function transitionAppointment(
  host: TransactionHost,
  id: string,
  from: AppointmentStatus,
  to: AppointmentStatus,
  data: Omit<Prisma.ClubTeamAppointmentUncheckedUpdateManyInput, 'status'> = {},
): Promise<void> {
  if (!ALLOWED[from].includes(to)) throw new UnprocessableError(`An appointment cannot go from ${from} to ${to}.`);
  const { count } = await host.tx.clubTeamAppointment.updateMany({ where: { id, status: from }, data: { ...data, status: to } });
  if (count === 0) throw new ConflictError('That appointment was changed by someone else. Reload and try again.');
}
