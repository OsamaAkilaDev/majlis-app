'use client';

import type { Invitation, MyClub, MyClubList } from '@majlis/contracts';
import { CaretRight } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ListSection } from '@/components/ListSection';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { problemMessage } from '@/lib/api';
import { acceptInvitation, declineInvitation, myClubs, myInvitations } from '@/lib/clubs';
import { enumLabel, roleLabel } from '@/lib/enum-label';
import { ICON_WEIGHT } from '@/lib/icons';
import { useAsyncError } from '@/lib/use-async-error';
import { useList } from '@/lib/use-list';

const ROW =
  'flex items-center gap-3 rounded-card border bg-surface p-2.5 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-surface-2';

function ClubRow({ club }: { club: MyClub }) {
  return (
    <Link href={`/clubs/${club.slug}`} className={`${ROW} border-border`}>
      <img src={club.logoUrl} alt="" className="size-12 shrink-0 rounded-control border border-border bg-surface-2 object-cover" />
      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{club.name}</span>

      {/* The officer's own way in: a club they run is the one they came for. */}
      {club.clubRoles.length > 0 ? (
        <span className="flex shrink-0 gap-1">
          {club.clubRoles.map((role) => (
            <span
              key={role}
              className="rounded-control bg-primary-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap text-primary-soft-fg"
            >
              {roleLabel(role)}
            </span>
          ))}
        </span>
      ) : (
        <CaretRight size={18} weight={ICON_WEIGHT} className="shrink-0 text-ink-3" aria-hidden />
      )}
    </Link>
  );
}

export function ClubGroups({
  initial,
  initialInvitations,
}: {
  initial: MyClubList | null;
  initialInvitations: Invitation[] | null;
}) {
  const { items, show } = useList(initial, () => myClubs());
  const [invitations, setInvitations] = useState<Invitation[] | null>(initialInvitations);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seeded = initial !== null && initialInvitations !== null;
  // Null is still loading; only a loaded, empty list drops the section.
  const showInvitations = invitations === null || invitations.length > 0;
  const fail = useAsyncError();

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([myClubs(), myInvitations()]);
    show(c);
    setInvitations(i.items);
  }, [show]);

  useEffect(() => {
    if (!seeded) load().catch(fail);
  }, [seeded, load, fail]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setActing(id);
    setError(null);
    try {
      await fn();
      // Accepting moves a club between lists, so both refetch.
      await load();
    } catch (err) {
      // An expired invitation answers 409, and its words are the whole story.
      setError(problemMessage(err, 'That did not go through.'));
    } finally {
      setActing(null);
    }
  }

  if (items === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[4.5rem]" />
        <Skeleton className="h-[4.5rem]" />
      </div>
    );
  }

  // /me/clubs returns these two statuses and no others.
  const active = items.filter((club) => club.status === 'ACTIVE');
  const pending = items.filter((club) => club.status === 'PENDING');

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href="/clubs/discover">Browse clubs</Link>
      </Button>

      {/* Invitations lead because they expire. */}
      {showInvitations ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-h1 text-ink">Invitations</h2>
          {error ? (
            <p role="alert" className="text-sm text-bad-fg">
              {error}
            </p>
          ) : null}
          {invitations === null ? (
            <Skeleton className="h-16" />
          ) : (
            <ul className="flex flex-col gap-2">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
                >
                  <img src={inv.clubLogoUrl} alt="" className="size-10 shrink-0 rounded-control border border-border bg-surface-2 object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{inv.clubName}</span>
                    <span className="block text-sm text-ink-2">{enumLabel(inv.role)}</span>
                  </span>
                  <Button
                    size="sm"
                    disabled={acting === inv.id}
                    onClick={() => act(inv.id, () => acceptInvitation(inv.id))}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting === inv.id}
                    onClick={() => act(inv.id, () => declineInvitation(inv.id))}
                  >
                    Decline
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <ListSection title="Your clubs" count={active.length}>
        {active.map((club) => (
          <li key={club.clubId}>
            <ClubRow club={club} />
          </li>
        ))}
      </ListSection>

      <ListSection title="Requested" count={pending.length}>
        {pending.map((club) => (
          <li key={club.clubId}>
            <ClubRow club={club} />
          </li>
        ))}
      </ListSection>
    </div>
  );
}
