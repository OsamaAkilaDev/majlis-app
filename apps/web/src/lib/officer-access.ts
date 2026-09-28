import type { ClubDetail, EventDetail, SessionUser } from '@majlis/contracts';
import { notFound, redirect } from 'next/navigation';
import { canCreateEvent, clubSectionsFor, type ClubSectionKey } from '@/lib/club-sections';
import { eventActionsFor, type EventActionKey } from '@/lib/event-actions';
import { serverFind } from '@/lib/server-api';
import { requireUser } from '@/lib/session';

/** Roles come from the API's read of the club, never the URL. */
export async function requireClub(slug: string): Promise<{ user: SessionUser; club: ClubDetail }> {
  const [user, found] = await Promise.all([
    requireUser(),
    serverFind<ClubDetail>(`/clubs/by-slug/${encodeURIComponent(slug)}`),
  ]);
  if (!found) notFound();
  return { user, club: found };
}

export async function requireClubSection(
  slug: string,
  key: ClubSectionKey,
): Promise<{ user: SessionUser; club: ClubDetail }> {
  const found = await requireClub(slug);
  const allowed = clubSectionsFor(found.club.viewerClubRoles, found.user.platformRole);
  if (!allowed.some((s) => s.key === key)) redirect(`/clubs/${slug}`);
  return found;
}

export async function requireEventCreate(
  slug: string,
): Promise<{ user: SessionUser; club: ClubDetail }> {
  const found = await requireClub(slug);
  if (!canCreateEvent(found.club.viewerClubRoles, found.user.platformRole)) {
    redirect(`/clubs/${slug}`);
  }
  return found;
}

export async function requireEventAction(
  eventId: string,
  key: EventActionKey,
): Promise<{ user: SessionUser; event: EventDetail }> {
  const [user, event] = await Promise.all([
    requireUser(),
    serverFind<EventDetail>(`/events/${eventId}`),
  ]);
  if (!event) notFound();
  if (!eventActionsFor(event, new Date(), user.platformRole).some((a) => a.key === key)) {
    redirect(`/events/${eventId}`);
  }
  return { user, event };
}
