import { imageAspectRatio } from '@majlis/contracts';
import { StudentShell } from '@/components/shell/StudentShell';
import { Bar, RowsSkeleton, SectionSkeleton } from '@/components/shell/skeleton-parts';

const BANNER_RATIO = imageAspectRatio('club-banner');

// The club's name is not known yet, so the header shows an ellipsis.
export default function Loading() {
  return (
    <StudentShell title="Club">
      {/* The crest overlaps the banner's foot by exactly what ClubDetail uses. */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col">
          <Bar className="w-full rounded-card" style={{ aspectRatio: BANNER_RATIO }} />
          <div className="relative z-10 -mt-9 flex items-end gap-4 px-3 sm:-mt-11 sm:px-5">
            <Bar className="size-19 shrink-0 rounded-card border-[3px] border-bg sm:size-26" />
            <span className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
              <Bar className="h-7 w-1/2" />
              <Bar className="h-4 w-1/3" />
            </span>
          </div>
        </div>
        <Bar className="h-9 w-full rounded-control sm:w-40" />
        <Bar className="h-16 w-full" />
        <SectionSkeleton width="w-28">
          <RowsSkeleton count={3} action={false} />
        </SectionSkeleton>
      </div>
    </StudentShell>
  );
}
