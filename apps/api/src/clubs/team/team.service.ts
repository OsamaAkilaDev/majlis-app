import { Injectable } from '@nestjs/common';
import type {
  Appointment,
  AppointLeadBody,
  AppointmentList,
  EndAppointmentBody,
  Invitation,
  InvitationList,
  InviteTeamMemberBody,
} from '@majlis/contracts';
import { AuditService } from '../../audit/audit.service';
import { clubOverrideReason } from '../../auth/override';
import type { Actor } from '../../auth/permissions';
import { WITH_USER } from '../../common/with-user';
import { NotFoundError, UnprocessableError } from '../../common/problem/domain-error';
import { conflictOn } from '../../common/prisma-constraint';
import type { ClubTeamAppointment as AppointmentRow } from '../../generated/prisma/client';
import type { ClubRole } from '../../generated/prisma/enums';
import { TransactionHost } from '../../prisma/transaction.host';
import { assertCanReadRoster, canReadRosterEmail } from '../roster-access';
import { assertAcceptsEdits } from '../club-status';
import { loadClub } from '../load-club';
import { transitionMembership } from '../membership/membership-status';
import { transitionAppointment } from './appointment-status';
import { NotificationService } from '../../notifications/notification.service';

const INVITATION_TTL_DAYS = 14;
const WITH_CLUB = { club: { select: { name: true, logoUrl: true } } } as const;

type AppointmentWithUser = AppointmentRow & { user: { fullName: string; email: string } };
type InvitationRow = AppointmentRow & { club: { name: string; logoUrl: string } };

function invitationExpiresAt(): Date {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    clubId: row.clubId,
    clubName: row.club.name,
    clubLogoUrl: row.club.logoUrl,
    role: row.role,
    // Always set on invitations, and myInvitations filters out null and lapsed rows.
    invitationExpiresAt: row.invitationExpiresAt!.toISOString(),
  };
}

// `withEmail` defaults true: every other caller has cleared `club:team-manage` or is the invitee.
function toAppointment(row: AppointmentWithUser, hasLeftClub: boolean, withEmail = true): Appointment {
  return {
    id: row.id,
    clubId: row.clubId,
    userId: row.userId,
    userFullName: row.user.fullName,
    ...(withEmail ? { userEmail: row.user.email } : {}),
    role: row.role,
    status: row.status,
    invitationExpiresAt: row.invitationExpiresAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    hasLeftClub,
  };
}

/** one_active_lead fires only on accept, one_open_per_role only on invitation. */
const mapWriteError = conflictOn({
  one_active_lead: 'That club already has an active Lead.',
  one_open_per_role: 'That user already holds or has been offered that role.',
});

@Injectable()
export class TeamService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private async hasLeftClub(clubId: string, userId: string): Promise<boolean> {
    const membership = await this.host.tx.clubMembership.findFirst({
      where: { clubId, userId, status: 'ACTIVE' },
    });
    return !membership;
  }

  // The nominee holds no authority until they accept.
  async appointLead(actor: { id: string }, clubId: string, body: AppointLeadBody): Promise<Appointment> {
    return this.host.run(async () => {
      const club = await loadClub(this.host, clubId, assertAcceptsEdits);
      if (body.userId === actor.id) throw new UnprocessableError('You cannot appoint yourself.');
      return this.createInvitation(actor, club, body.userId, 'LEAD', 'club.lead_invited');
    });
  }

  async invite(
    actor: Actor,
    clubId: string,
    body: InviteTeamMemberBody,
  ): Promise<Appointment> {
    return this.host.run(async () => {
      const club = await loadClub(this.host, clubId, assertAcceptsEdits);
      if (body.userId === actor.id) throw new UnprocessableError('You cannot invite yourself.');
      const reason = await clubOverrideReason(this.host, actor, clubId, body.overrideReason);
      return this.createInvitation(actor, club, body.userId, body.role, 'club.officer_invited', reason);
    });
  }

  private async createInvitation(
    actor: { id: string },
    club: { id: string; name: string },
    userId: string,
    role: ClubRole,
    action: 'club.lead_invited' | 'club.officer_invited',
    reason?: string,
  ): Promise<Appointment> {
    // A lapsed invitation stays INVITED until touched, and would block its own replacement.
    const lapsed = await this.host.tx.clubTeamAppointment.findFirst({
      where: { clubId: club.id, userId, role, status: 'INVITED', invitationExpiresAt: { lt: new Date() } },
    });
    if (lapsed) await transitionAppointment(this.host, lapsed.id, 'INVITED', 'EXPIRED');

    const row = await this.host.tx.clubTeamAppointment
      .create({
        data: {
          clubId: club.id,
          userId,
          role,
          status: 'INVITED',
          invitedById: actor.id,
          invitationExpiresAt: invitationExpiresAt(),
        },
        include: WITH_USER,
      })
      .catch(mapWriteError);

    await this.audit.record({
      action,
      entityType: 'ClubTeamAppointment',
      entityId: row.id,
      actorUserId: actor.id,
      reason,
      after: { clubId: club.id, userId, role },
    });

    // Same transaction, so a rolled-back invitation notifies nobody.
    await this.notifications.record({
      userId,
      type: 'team.invited',
      subject: row.id,
      payload: { appointmentId: row.id, clubId: club.id, clubName: club.name, role },
    });

    return toAppointment(row, await this.hasLeftClub(club.id, userId));
  }

  // Scoped by clubId, so another club's appointment is a 404, not a cross-club write.
  async end(actor: { id: string }, clubId: string, appointmentId: string, body: EndAppointmentBody): Promise<void> {
    return this.host.run(async () => {
      const appointment = await this.host.tx.clubTeamAppointment.findFirst({
        where: { id: appointmentId, clubId },
      });
      if (!appointment) throw new NotFoundError('No such appointment.');
      if (appointment.userId === actor.id) throw new UnprocessableError('You cannot end your own appointment.');
      if (appointment.status !== 'ACTIVE') throw new UnprocessableError('That appointment is not active.');

      await transitionAppointment(this.host, appointmentId, 'ACTIVE', 'ENDED', {
        endedAt: new Date(),
        endedReason: body.reason,
      });

      await this.audit.record({
        action: 'club.appointment_ended',
        entityType: 'ClubTeamAppointment',
        entityId: appointment.id,
        reason: body.reason,
        actorUserId: actor.id,
        before: { status: appointment.status },
        after: { status: 'ENDED' },
      });
    });
  }

  async list(actor: Actor, clubId: string): Promise<AppointmentList> {
    await assertCanReadRoster(this.host, actor, clubId);
    // The route has no @RequirePermission, so this is the only gate on emails.
    const withEmail = await canReadRosterEmail(this.host, actor, clubId, 'club:team-manage');

    const rows = await this.host.tx.clubTeamAppointment.findMany({
      where: { clubId },
      orderBy: { id: 'asc' },
      include: WITH_USER,
    });

    const activeMemberships = await this.host.tx.clubMembership.findMany({
      where: { clubId, userId: { in: rows.map((r) => r.userId) }, status: 'ACTIVE' },
      select: { userId: true },
    });
    const activeUserIds = new Set(activeMemberships.map((m) => m.userId));

    return { items: rows.map((r) => toAppointment(r, !activeUserIds.has(r.userId), withEmail)) };
  }

  /** The `userId: actor.id` filter is the entire authorization. */
  async myInvitations(actor: { id: string }): Promise<InvitationList> {
    const rows = await this.host.tx.clubTeamAppointment.findMany({
      where: {
        userId: actor.id,
        status: 'INVITED',
        invitationExpiresAt: { gt: new Date() },
      },
      orderBy: { id: 'asc' },
      include: WITH_CLUB,
    });

    return { items: rows.map(toInvitation) };
  }

  /**
   * Scoped to the actor, which is the authorization. Null means it lapsed and was flipped to EXPIRED:
   * the caller throws after `host.run`, since throwing inside would roll the flip back.
   */
  private async loadOpenInvitation(actorId: string, appointmentId: string): Promise<AppointmentRow | null> {
    const appt = await this.host.tx.clubTeamAppointment.findFirst({ where: { id: appointmentId, userId: actorId } });
    if (!appt) throw new NotFoundError('No such invitation.');
    if (appt.status !== 'INVITED') throw new UnprocessableError('That invitation is no longer open.');
    if (appt.invitationExpiresAt && appt.invitationExpiresAt.getTime() < Date.now()) {
      await transitionAppointment(this.host, appt.id, 'INVITED', 'EXPIRED');
      return null;
    }
    return appt;
  }

  async accept(actor: { id: string }, appointmentId: string): Promise<Appointment> {
    const appointment = await this.host.run(async () => {
      const appt = await this.loadOpenInvitation(actor.id, appointmentId);
      if (!appt) return null;

      const club = await this.host.tx.club.findUniqueOrThrow({ where: { id: appt.clubId } });
      assertAcceptsEdits(club.status);

      await transitionAppointment(this.host, appt.id, 'INVITED', 'ACTIVE', {
        acceptedAt: new Date(),
        termStart: new Date(),
      }).catch(mapWriteError);

      // Acceptance grants membership; conditional, since the partial unique index forbids a second.
      const open = await this.host.tx.clubMembership.findFirst({
        where: { clubId: appt.clubId, userId: actor.id, status: { in: ['PENDING', 'ACTIVE'] } },
      });
      if (!open) {
        await this.host.tx.clubMembership.create({
          data: { clubId: appt.clubId, userId: actor.id, status: 'ACTIVE' },
        });
      } else if (open.status === 'PENDING') {
        await transitionMembership(this.host, open.id, 'PENDING', 'ACTIVE', {
          decidedAt: new Date(),
          decidedById: actor.id,
        });
      }

      await this.audit.record({
        action: 'club.appointment_accepted',
        entityType: 'ClubTeamAppointment',
        entityId: appt.id,
        actorUserId: actor.id,
        before: { status: appt.status },
        after: { status: 'ACTIVE' },
      });

      const activated = await this.host.tx.clubTeamAppointment.findUniqueOrThrow({
        where: { id: appt.id },
        include: WITH_USER,
      });
      return toAppointment(activated, false);
    });

    if (!appointment) throw new UnprocessableError('That invitation has expired.');
    return appointment;
  }

  // Declining grants nothing, so no membership branch and no club status gate.
  async decline(actor: { id: string }, appointmentId: string): Promise<Appointment> {
    const appointment = await this.host.run(async () => {
      const appt = await this.loadOpenInvitation(actor.id, appointmentId);
      if (!appt) return null;

      await transitionAppointment(this.host, appt.id, 'INVITED', 'DECLINED');

      await this.audit.record({
        action: 'club.appointment_declined',
        entityType: 'ClubTeamAppointment',
        entityId: appt.id,
        actorUserId: actor.id,
        before: { status: appt.status },
        after: { status: 'DECLINED' },
      });

      const declined = await this.host.tx.clubTeamAppointment.findUniqueOrThrow({
        where: { id: appt.id },
        include: WITH_USER,
      });
      return toAppointment(declined, await this.hasLeftClub(appt.clubId, actor.id));
    });

    if (!appointment) throw new UnprocessableError('That invitation has expired.');
    return appointment;
  }
}
