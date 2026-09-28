'use client';

import { formatMoment, formatRange } from '@/lib/event-time';
import { useViewerZone } from '@/lib/use-viewer-zone';

/**
 * The zone is unknown until mount, and rendering the server's first is a hydration mismatch.
 * A non-breaking space holds the line height until then.
 */
const HOLD = ' ';

export function TimeRange({
  startsAt,
  endsAt,
  className,
}: {
  startsAt: string;
  endsAt: string;
  className?: string;
}) {
  const zone = useViewerZone();
  return <span className={className}>{zone ? formatRange(startsAt, endsAt, zone) : HOLD}</span>;
}

export function Moment({ at, className }: { at: string; className?: string }) {
  const zone = useViewerZone();
  return <span className={className}>{zone ? formatMoment(at, zone) : HOLD}</span>;
}
