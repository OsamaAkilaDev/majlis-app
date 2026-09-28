import { Injectable } from '@nestjs/common';
import type { ClubReport, OverviewReport } from '@majlis/contracts';
import { NotFoundError } from '../common/problem/domain-error';
import { eventsHeld } from '../events/event-status';
import { EXPECTED } from '../events/registration-status';
import { TransactionHost } from '../prisma/transaction.host';

const ATTENDED = ['CHECKED_IN', 'ATTENDED'] as const;

function tally<T extends string>(rows: { status: T; _count: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r.status, r._count]));
}

@Injectable()
export class ReportingService {
  constructor(private readonly host: TransactionHost) {}

  async overview(): Promise<OverviewReport> {
    const [clubs, events, users, activeMemberships, certificatesIssued] = await Promise.all([
      this.host.tx.club.groupBy({ by: ['status'], _count: true }),
      this.host.tx.event.groupBy({ by: ['status'], _count: true }),
      this.host.tx.user.count(),
      this.host.tx.clubMembership.count({ where: { status: 'ACTIVE' } }),
      // Revoked included: a revoked certificate was still issued.
      this.host.tx.certificate.count(),
    ]);

    return {
      clubsByStatus: tally(clubs),
      eventsByStatus: tally(events),
      users,
      activeMemberships,
      certificatesIssued,
    };
  }

  async forClub(clubId: string): Promise<ClubReport> {
    const club = await this.host.tx.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundError('No such club.');

    const inClub = { event: { clubId } };
    const [events, registrations, expected, attended, certificatesIssued] = await Promise.all([
      this.host.tx.event.count({ where: { clubId, ...eventsHeld() } }),
      this.host.tx.eventRegistration.count({ where: { ...inClub, status: { not: 'CANCELLED' } } }),
      this.host.tx.eventRegistration.count({ where: { ...inClub, status: { in: [...EXPECTED] } } }),
      this.host.tx.eventRegistration.count({ where: { ...inClub, status: { in: [...ATTENDED] } } }),
      this.host.tx.certificate.count({ where: inClub }),
    ]);

    return {
      clubId,
      events,
      registrations,
      expected,
      attended,
      // Zero, not NaN, which would fail the response schema.
      attendanceRate: expected === 0 ? 0 : attended / expected,
      certificatesIssued,
    };
  }
}
