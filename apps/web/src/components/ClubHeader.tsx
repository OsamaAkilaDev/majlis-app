import type { ReactNode } from 'react';
import { ClubBanner } from '@/components/ClubBanner';

export function ClubHeader({
  club,
  meta,
  badge,
  bannerAction,
  crestAction,
}: {
  club: { id: string; name: string; logoUrl: string; bannerUrl: string | null };
  meta: ReactNode;
  badge?: ReactNode;
  bannerAction?: ReactNode;
  crestAction?: ReactNode;
}) {
  return (
    <header className="flex flex-col">
      <div className="relative">
        <ClubBanner clubId={club.id} bannerUrl={club.bannerUrl} className="rounded-card" />
        {bannerAction ? <div className="absolute top-2 right-2">{bannerAction}</div> : null}
      </div>

      {/* `relative` is load-bearing: without it this row paints under the positioned banner. */}
      <div className="relative z-10 -mt-8 flex flex-col gap-2 px-3 sm:-mt-11 sm:flex-row sm:items-end sm:gap-4 sm:px-5">
        <div className="relative shrink-0">
          <img
            src={club.logoUrl}
            alt=""
            className="size-16 rounded-card border-[3px] border-bg bg-surface object-cover shadow-[var(--shadow-md)] sm:size-22 lg:size-26"
          />
          {crestAction ? <div className="absolute -right-1.5 -bottom-1.5">{crestAction}</div> : null}
        </div>

        {/* sm:mt-11 cancels the row's pull, so a long name never rides up into the banner. */}
        <div className="flex min-w-0 flex-1 items-end gap-3 sm:mt-11 sm:pb-1">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-h1 text-ink text-balance sm:text-title">{club.name}</h2>
            {meta}
          </div>
          {badge}
        </div>
      </div>
    </header>
  );
}
