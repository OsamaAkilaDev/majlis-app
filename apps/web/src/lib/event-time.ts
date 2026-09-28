// Two locales on purpose: en-GB for day-before-month dates, en-US for "6:00 PM" clocks.
const DATE_LOCALE = 'en-GB';
const TIME_LOCALE = 'en-US';

const DATE: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };

function part(
  value: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(value);
}

export const date = (value: Date, timeZone: string, options: Intl.DateTimeFormatOptions = DATE) =>
  part(value, timeZone, options, DATE_LOCALE);
export const clock = (value: Date, timeZone: string, extra: Intl.DateTimeFormatOptions = {}) =>
  part(value, timeZone, { ...TIME, ...extra }, TIME_LOCALE);

/** "Sat 12 Sept, 6:00 PM to 9:00 PM", repeating the date only across midnight. */
export function formatRange(startsAt: string, endsAt: string, timeZone: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const startDate = date(start, timeZone);
  const endDate = date(end, timeZone);
  const from = clock(start, timeZone);
  const to = clock(end, timeZone);

  return startDate === endDate
    ? `${startDate}, ${from} to ${to}`
    : `${startDate}, ${from} to ${endDate}, ${to}`;
}

export function formatClock(at: string, timeZone: string): string {
  return clock(new Date(at), timeZone);
}

export function formatChip(at: string, timeZone: string): { month: string; day: string } {
  const value = new Date(at);
  return {
    month: part(value, timeZone, { month: 'short' }, DATE_LOCALE),
    day: part(value, timeZone, { day: '2-digit' }, DATE_LOCALE),
  };
}

export function formatMoment(at: string, timeZone: string): string {
  const value = new Date(at);
  return `${date(value, timeZone)}, ${clock(value, timeZone)}`;
}

/** UTC, so server and browser render the same day and hydration does not mismatch. */
export function formatDay(at: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(at));
}

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
