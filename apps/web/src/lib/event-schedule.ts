/** Mirrors the API's `assertWindows` exactly. Never add a rule the server does not enforce. */

export const SCHEDULE_KEYS = [
  'startsAt',
  'endsAt',
  'registrationOpensAt',
  'registrationClosesAt',
] as const;

export type ScheduleKey = (typeof SCHEDULE_KEYS)[number];
export type ScheduleWindow = 'registration' | 'event';

export type Schedule = Record<ScheduleKey, string>;

export const WINDOW_ENDS: Record<ScheduleWindow, [ScheduleKey, ScheduleKey]> = {
  registration: ['registrationOpensAt', 'registrationClosesAt'],
  event: ['startsAt', 'endsAt'],
};

function at(iso: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** A window with an end missing is not an error yet; the field is still being filled. */
export function validateSchedule(schedule: Schedule): Partial<Record<ScheduleWindow, string>> {
  const errors: Partial<Record<ScheduleWindow, string>> = {};

  const starts = at(schedule.startsAt);
  const ends = at(schedule.endsAt);

  if (starts !== null && ends !== null && starts > ends) {
    errors.event = 'An event must end after it starts.';
  }

  return errors;
}

export function windowLength(from: string, to: string): string {
  const a = at(from);
  const b = at(to);
  if (a === null || b === null || b < a) return '';

  const minutes = Math.round((b - a) / 60_000);
  if (minutes < 60) return `${minutes} min`;

  const hours = minutes / 60;
  if (hours < 48) {
    const whole = Math.floor(hours);
    const rest = minutes - whole * 60;
    return rest === 0 ? `${whole} h` : `${whole} h ${rest} min`;
  }

  return `${Math.round(hours / 24)} days`;
}

export interface Span {
  window: ScheduleWindow;
  /** Fractions of the whole schedule, 0 to 1. */
  offset: number;
  length: number;
}

export function scheduleSpans(
  schedule: Schedule,
): { spans: Span[]; from: number; to: number } | null {
  const windows = (Object.keys(WINDOW_ENDS) as ScheduleWindow[])
    .map((window) => {
      const [a, b] = WINDOW_ENDS[window];
      const from = at(schedule[a]);
      const to = at(schedule[b]);
      return from !== null && to !== null ? { window, from, to: Math.max(to, from) } : null;
    })
    .filter((w) => w !== null);

  if (windows.length === 0) return null;

  const from = Math.min(...windows.map((w) => w.from));
  const to = Math.max(...windows.map((w) => w.to));
  const total = to - from;
  if (total <= 0) return null;

  return {
    from,
    to,
    spans: windows.map((w) => {
      // Floor tiny windows at 1%, and pull the offset back so the widened bar stays inside the strip.
      const length = Math.max((w.to - w.from) / total, 0.01);
      return { window: w.window, offset: Math.min((w.from - from) / total, 1 - length), length };
    }),
  };
}

/** Copies rather than sorting in place: the caller's array is state React renders from. */
export function byStart<T>(
  items: readonly T[],
  startsAt: (item: T) => string,
  newestFirst = false,
): T[] {
  const ascending = (a: T, b: T) => Date.parse(startsAt(a)) - Date.parse(startsAt(b));
  return [...items].sort(newestFirst ? (a, b) => ascending(b, a) : ascending);
}

/** Cut on the end, matching `GET /me/registrations?past=`: a running event is still upcoming. */
export function splitOnEnd<T extends { startsAt: string; endsAt: string }>(
  events: readonly T[],
  now: number,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const event of events) {
    (Date.parse(event.endsAt) < now ? past : upcoming).push(event);
  }
  const at = (event: T) => event.startsAt;
  return { upcoming: byStart(upcoming, at), past: byStart(past, at, true) };
}
