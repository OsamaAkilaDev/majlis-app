import { imageAspectRatio } from '@majlis/contracts';
import { cn } from '@/lib/cn';

/** The crop ratio of `club-banner` uploads, so the reserved box matches the bytes. */
const RATIO = imageAspectRatio('club-banner');

/** A hue in [0, 360) from the club id. FNV-1a, so ids differing by one character land far apart. */
function clubHue(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

/** Always draws; without artwork, a ground derived from the club id. Fixed lightness rather than
 *  theme tokens, since the scrim and crest are white in both themes. */
export function ClubBanner({
  clubId,
  bannerUrl,
  className,
}: {
  clubId: string;
  bannerUrl: string | null;
  className?: string;
}) {
  // A floor, not a second ratio: 4:1 of a narrow column is shorter than the crest.
  const box = cn('relative min-h-28 w-full overflow-hidden bg-surface-2 sm:min-h-0', className);

  if (bannerUrl) {
    return (
      <div className={box} style={{ aspectRatio: RATIO }}>
        <img src={bannerUrl} alt="" className="size-full object-cover" />
        <Scrim />
      </div>
    );
  }

  const a = clubHue(clubId);
  return (
    <div
      className={box}
      style={{
        aspectRatio: RATIO,
        backgroundImage: `linear-gradient(135deg, hsl(${a} 36% 20%), hsl(${(a + 38) % 360} 44% 34%))`,
      }}
    >
      <span aria-hidden className="lattice absolute inset-0 [--lattice:255_255_255] [--lattice-alpha:.07]" />
      <Scrim />
    </div>
  );
}

/** Carries the crest and the name that overlap the banner's foot. */
function Scrim() {
  return (
    <span
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-[rgba(10,30,27,.72)] to-transparent"
    />
  );
}
