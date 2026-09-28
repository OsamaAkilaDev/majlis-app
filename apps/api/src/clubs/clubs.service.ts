import { Injectable } from '@nestjs/common';
import {
  IMAGE_KINDS,
  type ClubDetail,
  type CommitteeMember,
  type ClubListQuery,
  type ClubList,
  type ClubSummary,
  type CreateClubBody,
  type ImageKind,
  type NewClubUpload,
  type PatchClubBody,
  type PatchClubStatusBody,
  type SignedUpload,
} from '@majlis/contracts';
import { v7 as uuidv7 } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { CLUB_FIELDS, assertFieldsAllowed, overrideReasonFor } from '../auth/field-permissions';
import { resolveClubFacts } from '../auth/permissions.guard';
import { matches, PERMISSIONS, type Actor } from '../auth/permissions';
import { NotFoundError, UnprocessableError } from '../common/problem/domain-error';
import { conflictOn } from '../common/prisma-constraint';
import type { Prisma, Club as ClubRow } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';
import { objectPath } from '../storage/image-kinds';
import { StorageService } from '../storage/storage.service';
import { assertAcceptsEdits, assertTransition } from './club-status';
import { eventsHeld } from '../events/event-status';
import { loadClub } from './load-club';
import { canReadInactiveClub } from './roster-access';
import { deriveSlug, uniqueSlug } from './slug';

const ACTIVE_ONLY = { status: 'ACTIVE' } as const;

/** Counts as "already in this club". LEFT is excluded: a club left is worth re-showing. */
const HELD = ['ACTIVE', 'PENDING'] as const;

const ROLE_ORDER: Record<CommitteeMember['role'], number> = {
  LEAD: 0,
  VICE_LEAD: 1,
  OPERATIONS: 2,
  CTO: 3,
  MARKETING: 4,
};

const COMMITTEE_INCLUDE = {
  where: ACTIVE_ONLY,
  select: { userId: true, role: true, acceptedAt: true, user: { select: { fullName: true } } },
} as const;

function toCommittee(
  rows: { userId: string; role: CommitteeMember['role']; acceptedAt: Date | null; user: { fullName: string } }[],
): CommitteeMember[] {
  return rows
    .map((a) => ({
      userId: a.userId,
      fullName: a.user.fullName,
      role: a.role,
      since: a.acceptedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

function toClubSummary(
  row: ClubRow,
  departmentName: string,
  memberCount: number,
  viewerJoined: boolean,
): ClubSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    logoUrl: row.logoUrl,
    status: row.status,
    membershipPolicy: row.membershipPolicy,
    departmentName,
    memberCount,
    viewerJoined,
  };
}

interface DetailExtras {
  viewerMembershipStatus: ClubDetail['viewerMembershipStatus'];
  viewerClubRoles: ClubDetail['viewerClubRoles'];
  committee: CommitteeMember[];
  pendingMemberCount: ClubDetail['pendingMemberCount'];
  eventsRun: number;
}

function toClubDetail(
  row: ClubRow,
  departmentName: string,
  memberCount: number,
  extras: DetailExtras,
): ClubDetail {
  return {
    ...toClubSummary(
      row,
      departmentName,
      memberCount,
      extras.viewerMembershipStatus !== null && (HELD as readonly string[]).includes(extras.viewerMembershipStatus),
    ),
    description: row.description,
    academicYear: row.academicYear,
    bannerUrl: row.bannerUrl,
    departmentId: row.departmentId,
    ...extras,
  };
}

/** Only `create` (Admin-only) uses this, hence pendingMemberCount 0 rather than null. */
const NO_EXTRAS: DetailExtras = {
  viewerMembershipStatus: null,
  viewerClubRoles: [],
  committee: [],
  pendingMemberCount: 0,
  eventsRun: 0,
};

/** `uniqueSlug`'s pre-check can race, so a lost race must name the constraint that fired. */
const mapWriteError = conflictOn({
  slug: 'A club with that slug already exists.',
  name: 'A club with that name already exists.',
});

@Injectable()
export class ClubsService {
  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // Mints the club id up front, so the logo's object path exists before the club does.
  async mintLogoUpload(): Promise<NewClubUpload> {
    const clubId = uuidv7();
    return { clubId, ...(await this.mintEditUpload(clubId, 'club-logo')) };
  }

  /** Ungated. Call directly only for an entity that does not exist yet. */
  async mintEditUpload(resourceId: string, kind: ImageKind): Promise<SignedUpload> {
    const path = objectPath(kind, resourceId);
    const { signedUrl, token } = await this.storage.createSignedUploadUrl(path);
    return { path, signedUrl, token, publicUrl: this.storage.publicUrlFor(path, Date.now()) };
  }

  /** Overwriting the live object is an edit, so it takes `update`'s status gate. */
  async mintClubImageUpload(actor: { id: string }, clubId: string, kind: ImageKind): Promise<SignedUpload> {
    return this.host.run(async () => {
      await loadClub(this.host, clubId, assertAcceptsEdits);
      const upload = await this.mintEditUpload(clubId, kind);

      await this.audit.record({
        action: 'club.upload_url_minted',
        entityType: 'Club',
        entityId: clubId,
        actorUserId: actor.id,
        after: { kind, path: upload.path },
      });

      return upload;
    });
  }

  // The API never sees the bytes, so the uploaded object is checked before its URL is stored.
  async verifyUpload(kind: ImageKind, resourceId: string): Promise<string> {
    const path = objectPath(kind, resourceId);
    const stat = await this.storage.statObject(path);

    if (!stat) throw new UnprocessableError('That image was not uploaded.');
    if (stat.contentType !== 'image/webp') throw new UnprocessableError('That image is not a WebP.');
    if (stat.size > IMAGE_KINDS[kind].maxBytes) throw new UnprocessableError('That image is too large.');

    return this.storage.publicUrlFor(path, Date.now());
  }

  async create(actor: { id: string }, body: CreateClubBody): Promise<ClubDetail> {
    return this.host.run(async () => {
      const logoUrl = await this.verifyUpload('club-logo', body.clubId);
      const slug = await uniqueSlug(deriveSlug(body.name), (s) =>
        this.host.tx.club.count({ where: { slug: s } }).then((n) => n > 0),
      );

      const row = await this.host.tx.club
        .create({
          data: {
            id: body.clubId,
            departmentId: body.departmentId,
            name: body.name,
            slug,
            description: body.description,
            category: body.category,
            academicYear: body.academicYear,
            logoUrl,
            membershipPolicy: body.membershipPolicy,
          },
          include: { department: { select: { name: true } } },
        })
        .catch(mapWriteError);

      await this.audit.record({
        action: 'club.created',
        entityType: 'Club',
        entityId: row.id,
        actorUserId: actor.id,
        after: { name: row.name, slug: row.slug, departmentId: row.departmentId },
      });

      return toClubDetail(row, row.department.name, 0, NO_EXTRAS);
    });
  }

  async list(actor: Actor, query: ClubListQuery): Promise<ClubList> {
    // Non-admins see ACTIVE only, whatever they asked for.
    const status = actor.platformRole === 'ADMIN' ? query.status : 'ACTIVE';

    const where: Prisma.ClubWhereInput = {
      ...(status ? { status } : {}),
      // Scoped to actor.id, or it hides every club with any member.
      ...(query.joinable
        ? { memberships: { none: { userId: actor.id, status: { in: [...HELD] } } } }
        : {}),
    };

    const rows = await this.host.tx.club.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        department: { select: { name: true } },
        _count: { select: { memberships: { where: ACTIVE_ONLY } } },
        memberships: {
          where: { userId: actor.id, status: { in: [...HELD] } },
          select: { id: true },
          take: 1,
        },
      },
    });

    return {
      items: rows.map((c) =>
        toClubSummary(c, c.department.name, c._count.memberships, c.memberships.length > 0),
      ),
    };
  }

  async detail(actor: Actor, clubId: string): Promise<ClubDetail> {
    return this.detailWhere(actor, { id: clubId });
  }

  async detailBySlug(actor: Actor, slug: string): Promise<ClubDetail> {
    return this.detailWhere(actor, { slug });
  }

  private async detailWhere(
    actor: Actor,
    where: { id: string } | { slug: string },
  ): Promise<ClubDetail> {
    const club = await this.host.tx.club.findUnique({
      where,
      include: {
        department: { select: { name: true } },
        appointments: COMMITTEE_INCLUDE,
        // Scoped to `actor.id`, or it reports someone else's membership as the viewer's.
        memberships: {
          where: { userId: actor.id },
          orderBy: { requestedAt: 'desc' },
          take: 1,
          select: { status: true },
        },
        _count: { select: { memberships: { where: ACTIVE_ONLY }, events: { where: eventsHeld() } } },
      },
    });
    if (!club) throw new NotFoundError('No such club.');
    const clubId = club.id;

    // 404, not 403: admitting an inactive club exists is itself the leak.
    if (club.status !== 'ACTIVE' && !(await canReadInactiveClub(this.host, actor, clubId))) {
      throw new NotFoundError('No such club.');
    }

    const viewerClubRoles = club.appointments
      .filter((a) => a.userId === actor.id)
      .map((a) => a.role);

    // A separate query: Prisma cannot alias two filtered counts of one relation.
    const canDecide = matches(PERMISSIONS['membership:decide'], {
      userId: actor.id,
      platformRole: actor.platformRole,
      clubRoles: viewerClubRoles,
      eventResponsibilities: [],
    });

    const pendingMemberCount = canDecide
      ? await this.host.tx.clubMembership.count({ where: { clubId, status: 'PENDING' } })
      : null;

    return toClubDetail(club, club.department.name, club._count.memberships, {
      viewerMembershipStatus: club.memberships[0]?.status ?? null,
      viewerClubRoles,
      committee: toCommittee(club.appointments),
      pendingMemberCount,
      eventsRun: club._count.events,
    });
  }

  // `data` is built key by key, never spread, so a body cannot smuggle `status` or `slug` in.
  async update(actor: Actor, clubId: string, body: PatchClubBody): Promise<ClubDetail> {
    await this.host.run(async () => {
      await loadClub(this.host, clubId, assertAcceptsEdits);

      const { clubRoles } = await resolveClubFacts(this.host, actor.id, clubId);
      const facts = { platformRole: actor.platformRole, clubRoles };

      // overrideReason is not a column; CLUB_FIELDS would fail closed on it.
      const { overrideReason, ...fields } = body;
      assertFieldsAllowed(fields, CLUB_FIELDS, facts);
      const reason = overrideReasonFor(facts, overrideReason);

      const data: Prisma.ClubUncheckedUpdateInput = {};
      if (body.departmentId !== undefined) data.departmentId = body.departmentId;
      if (body.description !== undefined) data.description = body.description;
      if (body.category !== undefined) data.category = body.category;
      if (body.academicYear !== undefined) data.academicYear = body.academicYear;
      if (body.membershipPolicy !== undefined) data.membershipPolicy = body.membershipPolicy;
      if (body.logoUploaded) data.logoUrl = await this.verifyUpload('club-logo', clubId);
      if (body.bannerUploaded) data.bannerUrl = await this.verifyUpload('club-banner', clubId);

      await this.host.tx.club.update({ where: { id: clubId }, data });

      await this.audit.record({
        action: 'club.updated',
        entityType: 'Club',
        entityId: clubId,
        actorUserId: actor.id,
        reason,
        after: data as Record<string, unknown>,
      });
    });

    // Read after commit, outside the transaction.
    return this.detail(actor, clubId);
  }

  async updateStatus(actor: Actor, clubId: string, body: PatchClubStatusBody): Promise<ClubDetail> {
    await this.host.run(async () => {
      const before = await loadClub(this.host, clubId);
      assertTransition(before.status, body.status);

      const after = await this.host.tx.club.update({ where: { id: clubId }, data: { status: body.status } });

      const action =
        body.status === 'ARCHIVED' ? 'club.archived' : body.status === 'SUSPENDED' ? 'club.suspended' : 'club.reactivated';

      await this.audit.record({
        action,
        entityType: 'Club',
        entityId: clubId,
        reason: body.reason,
        actorUserId: actor.id,
        before: { status: before.status },
        after: { status: after.status },
      });
    });

    return this.detail(actor, clubId);
  }
}
