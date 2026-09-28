import { Injectable } from '@nestjs/common';
import type {
  AddMemberBody,
  DecideMembershipBody,
  Member,
  MemberListQuery,
  MemberList,
  MyClubList,
  RemoveMemberBody,
} from '@majlis/contracts';
import { AuditService } from '../../audit/audit.service';
import { clubOverrideReason } from '../../auth/override';
import type { Actor } from '../../auth/permissions';
import { WITH_USER } from '../../common/with-user';
import { NotFoundError, UnprocessableError } from '../../common/problem/domain-error';
import { conflictOn } from '../../common/prisma-constraint';
import type { ClubRole } from '../../generated/prisma/enums';
import type { Prisma, ClubMembership as MembershipRow } from '../../generated/prisma/client';
import { TransactionHost } from '../../prisma/transaction.host';
import { assertCanReadRoster, canReadRosterEmail } from '../roster-access';
import { assertAcceptsEdits, assertAcceptsNewActivity } from '../club-status';
import { loadClub } from '../load-club';
import { transitionMembership } from './membership-status';
import { NotificationService } from '../../notifications/notification.service';

type MembershipWithUser = MembershipRow & { user: { fullName: string; email: string } };

// `withEmail` defaults true: every other caller has cleared `membership:decide`.
function toMember(row: MembershipWithUser, clubRoles: ClubRole[], withEmail = true): Member {
  return {
    id: row.id,
    userId: row.userId,
    userFullName: row.user.fullName,
    ...(withEmail ? { userEmail: row.user.email } : {}),
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    clubRoles,
  };
}

const mapWriteError = conflictOn({
  one_open_per_user: 'You already have an open membership in that club.',
});

@Injectable()
export class MembershipService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private async roles(
    where: Prisma.ClubTeamAppointmentWhereInput,
    key: 'clubId' | 'userId',
  ): Promise<Map<string, ClubRole[]>> {
    const rows = await this.host.tx.clubTeamAppointment.findMany({
      where: { ...where, status: 'ACTIVE' },
      select: { clubId: true, userId: true, role: true },
    });
    const map = new Map<string, ClubRole[]>();
    for (const r of rows) map.set(r[key], [...(map.get(r[key]) ?? []), r.role]);
    return map;
  }

  private async rolesFor(clubId: string, userId: string): Promise<ClubRole[]> {
    return (await this.roles({ clubId, userId }, 'userId')).get(userId) ?? [];
  }

  // Self-scoped, which is why the route has no @RequirePermission.
  async request(actor: { id: string }, clubId: string): Promise<Member> {
    return this.host.run(async () => {
      const club = await loadClub(this.host, clubId, assertAcceptsNewActivity);

      let status: 'ACTIVE' | 'PENDING';
      if (club.membershipPolicy === 'OPEN') status = 'ACTIVE';
      else if (club.membershipPolicy === 'APPROVAL_REQUIRED') status = 'PENDING';
      else throw new UnprocessableError('That club is not open for membership requests.');

      const row = await this.host.tx.clubMembership
        .create({ data: { clubId, userId: actor.id, status }, include: WITH_USER })
        .catch(mapWriteError);

      await this.audit.record({
        action: status === 'ACTIVE' ? 'club.membership_joined' : 'club.membership_requested',
        entityType: 'ClubMembership',
        entityId: row.id,
        actorUserId: actor.id,
        after: { clubId, userId: actor.id, status: row.status },
      });

      return toMember(row, await this.rolesFor(clubId, actor.id));
    });
  }

  /** Refused under CLOSED, or CLOSED would behave exactly like INVITE_ONLY. */
  async addMember(
    actor: Actor,
    clubId: string,
    body: AddMemberBody,
  ): Promise<Member> {
    return this.host.run(async () => {
      const club = await loadClub(this.host, clubId, assertAcceptsNewActivity);
      if (club.membershipPolicy === 'CLOSED') throw new UnprocessableError('That club is closed to new members.');
      const reason = await clubOverrideReason(this.host, actor, clubId, body.overrideReason);

      const row = await this.host.tx.clubMembership
        .create({
          data: { clubId, userId: body.userId, status: 'ACTIVE', decidedById: actor.id, decidedAt: new Date() },
          include: WITH_USER,
        })
        .catch(mapWriteError);

      await this.audit.record({
        action: 'club.member_added',
        entityType: 'ClubMembership',
        entityId: row.id,
        actorUserId: actor.id,
        reason,
        after: { clubId, userId: row.userId, status: row.status },
      });

      return toMember(row, await this.rolesFor(clubId, row.userId));
    });
  }

  /** Scoped by clubId, so another club's request is a 404, not a cross-club decision. */
  async decide(actor: { id: string }, clubId: string, requestId: string, body: DecideMembershipBody): Promise<Member> {
    return this.host.run(async () => {
      const club = await loadClub(this.host, clubId, assertAcceptsEdits);

      const existing = await this.host.tx.clubMembership.findFirst({ where: { id: requestId, clubId } });
      if (!existing) throw new NotFoundError('No such membership request.');
      if (existing.userId === actor.id) throw new UnprocessableError('You cannot decide your own membership request.');
      if (existing.status !== 'PENDING') throw new UnprocessableError('That request is not pending.');

      await transitionMembership(this.host, existing.id, 'PENDING', body.status, {
        decidedAt: new Date(),
        decidedById: actor.id,
        decisionReason: body.reason ?? null,
      });
      const row = await this.host.tx.clubMembership.findUniqueOrThrow({ where: { id: existing.id }, include: WITH_USER });

      await this.audit.record({
        action: body.status === 'ACTIVE' ? 'club.membership_approved' : 'club.membership_rejected',
        entityType: 'ClubMembership',
        entityId: row.id,
        reason: body.reason,
        actorUserId: actor.id,
        before: { status: existing.status },
        after: { status: row.status },
      });

      await this.notifications.record({
        userId: row.userId,
        type: 'membership.decided',
        subject: row.id,
        payload: { membershipId: row.id, clubId, clubName: club.name, status: row.status },
      });

      return toMember(row, await this.rolesFor(clubId, row.userId));
    });
  }

  async leave(actor: { id: string }, clubId: string): Promise<void> {
    return this.host.run(async () => {
      await loadClub(this.host, clubId, assertAcceptsEdits);

      const existing = await this.host.tx.clubMembership.findFirst({
        where: { clubId, userId: actor.id, status: { in: ['PENDING', 'ACTIVE'] } },
      });
      if (!existing) throw new NotFoundError('You have no open membership in that club.');

      await transitionMembership(this.host, existing.id, existing.status, 'LEFT', {
        decidedAt: new Date(),
        decidedById: actor.id,
      });

      await this.audit.record({
        action: 'club.membership_left',
        entityType: 'ClubMembership',
        entityId: existing.id,
        actorUserId: actor.id,
        before: { status: existing.status },
        after: { status: 'LEFT' },
      });
    });
  }

  // REMOVED, never LEFT, so an officer's removal stays distinguishable from leaving.
  async remove(
    actor: Actor,
    clubId: string,
    userId: string,
    body: RemoveMemberBody,
  ): Promise<void> {
    return this.host.run(async () => {
      await loadClub(this.host, clubId, assertAcceptsEdits);

      const existing = await this.host.tx.clubMembership.findFirst({
        where: { clubId, userId, status: { in: ['PENDING', 'ACTIVE'] } },
      });
      if (!existing) throw new NotFoundError('No such member.');
      const reason = await clubOverrideReason(this.host, actor, clubId, body.overrideReason);

      await transitionMembership(this.host, existing.id, existing.status, 'REMOVED', {
        decidedAt: new Date(),
        decidedById: actor.id,
      });

      await this.audit.record({
        action: 'club.membership_removed',
        entityType: 'ClubMembership',
        entityId: existing.id,
        actorUserId: actor.id,
        reason,
        before: { status: existing.status },
        after: { status: 'REMOVED' },
      });
    });
  }

  async members(actor: Actor, clubId: string, query: MemberListQuery): Promise<MemberList> {
    await assertCanReadRoster(this.host, actor, clubId);
    // The route has no @RequirePermission, so this is the only gate on emails.
    const withEmail = await canReadRosterEmail(this.host, actor, clubId, 'membership:decide');

    const where: Prisma.ClubMembershipWhereInput = {
      clubId,
      ...(query.status ? { status: query.status } : {}),
    };

    const rows = await this.host.tx.clubMembership.findMany({
      where,
      orderBy: { id: 'asc' },
      include: WITH_USER,
    });

    const roles = await this.roles({ clubId, userId: { in: rows.map((r) => r.userId) } }, 'userId');

    return { items: rows.map((r) => toMember(r, roles.get(r.userId) ?? [], withEmail)) };
  }

  // PENDING/ACTIVE only: a rejoined club keeps its LEFT row and would appear twice.
  async myClubs(actor: { id: string }): Promise<MyClubList> {
    const rows = await this.host.tx.clubMembership.findMany({
      where: { userId: actor.id, status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: { id: 'asc' },
      include: { club: { select: { slug: true, name: true, logoUrl: true } } },
    });

    const roles = await this.roles({ userId: actor.id, clubId: { in: rows.map((r) => r.clubId) } }, 'clubId');

    return {
      items: rows.map((r) => ({
        clubId: r.clubId,
        slug: r.club.slug,
        name: r.club.name,
        logoUrl: r.club.logoUrl,
        status: r.status,
        clubRoles: roles.get(r.clubId) ?? [],
      })),
    };
  }
}
