import type { ReactNode } from 'react';

/** A heading, its count and the rows; renders nothing when empty. */
export function ListSection({
  title,
  count,
  heading: Heading = 'h2',
  children,
}: {
  title: string;
  count: number;
  heading?: 'h2' | 'h3';
  children: ReactNode;
}) {
  if (count === 0) return null;

  return (
    // max-w-3xl, so a row's trailing count stays near its title on desktop.
    <section className="flex w-full max-w-3xl flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <Heading className="font-display text-h1 text-ink">{title}</Heading>
        <span className="text-sm tabular-nums text-ink-3">{count}</span>
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}
