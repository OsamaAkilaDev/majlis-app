import { now, parseAbsolute, type ZonedDateTime } from '@internationalized/date';

/** React Aria types a picker's emitted value from `value` or `placeholderValue`, so an empty picker
 *  needs a zoned placeholder or it emits a zoneless `CalendarDateTime`. */

/** An absolute instant read in a given zone, or null when unset or unparseable. */
export function readIn(iso: string, timeZone: string): ZonedDateTime | null {
  if (!iso) return null;
  try {
    return parseAbsolute(iso, timeZone);
  } catch {
    return null;
  }
}

/** Midnight today in `timeZone`: an empty picker's placeholder, and what declares its emitted type. */
export function placeholderIn(timeZone: string): ZonedDateTime {
  // A bad zone falls back to UTC: a throw would take the whole form down.
  try {
    return now(timeZone).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
  } catch {
    return now('UTC').set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
  }
}
