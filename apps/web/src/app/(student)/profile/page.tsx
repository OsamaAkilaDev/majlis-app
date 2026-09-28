import type { CertificateList, MyRegistrationList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { ArrowSquareOut, CaretRight, Certificate, Ticket } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { initials } from '@/lib/initials';
import { StudentShell } from '@/components/shell/StudentShell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ICON_WEIGHT } from '@/lib/icons';
import { shellDestinations } from '@/lib/routing';
import { serverFetch } from '@/lib/server-api';
import { requireUser } from '@/lib/session';
import { SignOutButton, ThemeChoice } from './ProfileSettings';

export const metadata: Metadata = { title: 'Profile' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-h1 text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** The count comes from a capped page, so a full page reads as "at least this many". */
function Tile({
  href,
  label,
  count,
  icon,
}: {
  href: string;
  label: string;
  count: number | null;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5 hover:bg-surface-2"
    >
      <span className="flex items-center justify-between text-ink-3">
        {icon}
        <CaretRight size={16} weight={ICON_WEIGHT} aria-hidden />
      </span>
      {count === null ? null : (
        <span className="tabular font-display text-title leading-none text-ink">
          {count}
        </span>
      )}
      <span className="text-sm font-medium text-ink-2">{label}</span>
    </Link>
  );
}

export default async function ProfilePage() {
  const [user, registrations, certificates] = await Promise.all([
    requireUser(),
    serverFetch<MyRegistrationList>(`/me/registrations`),
    serverFetch<CertificateList>(`/me/certificates`),
  ]);

  const consoles = shellDestinations(user);

  return (
    <StudentShell title="Profile">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="lattice relative flex items-center gap-4 overflow-hidden rounded-sheet bg-primary-soft p-4 text-primary-soft-fg sm:p-5">
          <Avatar className="size-16 shrink-0 after:border-transparent">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-primary text-h1 font-semibold text-primary-fg">
              {initials(user.fullName)}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col gap-0.5">
            <span className="truncate font-display text-h1 text-primary-soft-fg">
              {user.fullName}
            </span>
            <span className="selectable truncate text-sm opacity-85">{user.email}</span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-primary/12 px-2 py-0.5 text-label font-semibold uppercase">
                {user.platformRole === 'ADMIN' ? 'Admin' : 'Student'}
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Tile
            href="/profile/registrations"
            label="Registrations"
            count={registrations?.items.length ?? null}
            icon={<Ticket size={22} weight={ICON_WEIGHT} aria-hidden />}
          />
          <Tile
            href="/profile/certificates"
            label="Certificates"
            count={certificates?.items.length ?? null}
            icon={<Certificate size={22} weight={ICON_WEIGHT} aria-hidden />}
          />
        </div>

        <Section title="Appearance">
          <ThemeChoice />
        </Section>

        {consoles.length > 0 ? (
          <Section title="Switch to">
            <ul className="flex flex-col gap-2">
              {consoles.map(({ href, label, meta }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 hover:bg-surface-2"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-2 text-ink-2">
                      <ArrowSquareOut size={18} weight={ICON_WEIGHT} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{label}</span>
                      {meta ? <span className="block text-sm text-ink-2">{meta}</span> : null}
                    </span>
                    <CaretRight size={16} weight={ICON_WEIGHT} className="text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <SignOutButton />
      </div>
    </StudentShell>
  );
}
