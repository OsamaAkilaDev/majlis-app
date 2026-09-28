'use client';

import { toCalendarDate } from '@internationalized/date';
import { CalendarBlank, CaretLeft, CaretRight, WarningCircle } from '@phosphor-icons/react/ssr';
import { useContext, useEffect } from 'react';
import {
  Button,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DateRangePicker,
  DateRangePickerStateContext,
  DateSegment,
  Dialog,
  Group,
  Heading,
  I18nProvider,
  Label,
  Popover,
  RangeCalendar,
  TimeField,
} from 'react-aria-components';
import { cn } from '@/lib/cn';
import { ICON_WEIGHT } from '@/lib/icons';
import { placeholderIn, readIn } from '@/lib/zoned';

/** One window, not two timestamps. Edited on the viewer's clock and stored as an absolute instant,
 *  so `timeZone` is the reader's and undefined until mounted. */
export function DateTimeRange({
  label,
  timeZone,
  from,
  to,
  onChange,
  swatch,
  error,
  disabled,
  hint,
}: {
  label: string;
  /** The viewer's zone, undefined until mounted. */
  timeZone: string | undefined;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  swatch: string;
  error?: string | undefined;
  disabled?: boolean;
  /** A fact about the window, such as how long it runs. Never an instruction. */
  hint?: string;
}) {
  // Nothing renders until the zone is known: Node's ICU and the browser's build the segments differently,
  // a hydration mismatch. The box holds the control's height so the form does not jump.
  if (timeZone === undefined) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-label font-bold tracking-[0.07em] text-ink-3 uppercase">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: swatch }} />
          {label}
        </span>
        <div className="min-h-10 rounded-control border border-border-control bg-surface" />
      </div>
    );
  }

  const zone = timeZone;
  const start = readIn(from, zone);
  const end = readIn(to, zone);

  return (
    // en-GB so a typed date is day first like every rendered one. `Segment` uppercases its day period.
    <I18nProvider locale="en-GB">
      <DateRangePicker
        aria-label={label}
        value={start && end ? { start, end } : null}
        // Not decoration: React Aria types every emitted value from this, and without it the first range
        // picked is a zoneless CalendarDateTime that throws on `toAbsoluteString`.
        placeholderValue={placeholderIn(zone)}
        // Null when a segment is blanked. Keeping the old instants would save a window the officer cannot see.
        onChange={(next) =>
          onChange(next?.start.toAbsoluteString() ?? '', next?.end.toAbsoluteString() ?? '')
        }
        granularity="minute"
        hourCycle={12}
        // Otherwise a zoned value with time granularity appends a timeZoneName segment.
        hideTimeZone
        // Stays open for the clocks below the grid; `SeedTimes` makes that safe.
        shouldCloseOnSelect={false}
        isDisabled={disabled}
        isInvalid={Boolean(error)}
        shouldForceLeadingZeros
        className="flex flex-col gap-1.5"
      >
        <Label className="flex items-center gap-2 text-label font-bold tracking-[0.07em] text-ink-3 uppercase">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: swatch }} />
          {label}
        </Label>

        <Group className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-border-control bg-surface px-2.5 py-1.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary-soft data-[invalid]:border-bad data-[invalid]:focus-within:ring-bad-soft data-disabled:opacity-50">
          <DateInput slot="start" className="flex items-center text-sm tabular-nums text-ink">
            {(segment) => <Segment segment={segment} />}
          </DateInput>

          {/* A dash between two stacked rows reads as a minus sign. */}
          <span aria-hidden className="hidden shrink-0 text-ink-3 sm:inline">
            →
          </span>

          <DateInput slot="end" className="flex items-center text-sm tabular-nums text-ink">
            {(segment) => <Segment segment={segment} />}
          </DateInput>

          <Button
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            aria-label={`${label}: pick dates`}
          >
            <CalendarBlank size={16} weight={ICON_WEIGHT} aria-hidden />
          </Button>
        </Group>

        {error ? (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-bad-fg">
            <WarningCircle size={14} weight={ICON_WEIGHT} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : hint ? (
          <p className="text-sm text-ink-2">{hint}</p>
        ) : null}

        {/* React Aria caps the popover at the space left, which a phone keyboard shrinks to a sliver. */}
        <Popover className="w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-card border border-border bg-surface p-3 shadow-[var(--shadow-md)]">
          <Dialog className="flex flex-col gap-3 outline-none">
            <RangeCalendar className="flex flex-col gap-2">
              <header className="flex items-center gap-2">
                <Button
                  slot="previous"
                  aria-label="Previous month"
                  className="grid size-7 place-items-center rounded-control text-ink-2 hover:bg-surface-2"
                >
                  <CaretLeft size={15} weight={ICON_WEIGHT} aria-hidden />
                </Button>
                <Heading className="flex-1 text-center text-sm font-semibold text-ink" />
                <Button
                  slot="next"
                  aria-label="Next month"
                  className="grid size-7 place-items-center rounded-control text-ink-2 hover:bg-surface-2"
                >
                  <CaretRight size={15} weight={ICON_WEIGHT} aria-hidden />
                </Button>
              </header>

              <CalendarGrid className="border-separate border-spacing-0.5">
                {(date) => (
                  <CalendarCell
                    date={date}
                    className={cn(
                      'grid size-8 cursor-default place-items-center rounded-control text-sm tabular-nums text-ink outline-none',
                      'data-outside-month:invisible data-disabled:text-ink-3',
                      'data-hovered:bg-surface-2',
                      'data-selected:bg-primary-soft data-selected:text-primary-soft-fg',
                      'data-selection-start:bg-primary data-selection-start:text-primary-fg',
                      'data-selection-end:bg-primary data-selection-end:text-primary-fg',
                      'data-focus-visible:outline-2 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus',
                    )}
                  />
                )}
              </CalendarGrid>
            </RangeCalendar>

            <SeedTimes timeZone={zone} />

            <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-2">
              <Clock part="start" label="Starts" timeZone={zone} />
              <Clock part="end" label="Ends" timeZone={zone} />
            </div>
          </Dialog>
        </Popover>
      </DateRangePicker>
    </I18nProvider>
  );
}

/** Commits a picked range at midnight, or closing before both times are set loses the dates.
 *  One `setValue`, not two `setTime`s: a second `setTime` in the same tick overwrites the first. */
function SeedTimes({ timeZone }: { timeZone: string }) {
  const state = useContext(DateRangePickerStateContext);

  useEffect(() => {
    const range = state?.dateRange;
    if (!state || !range?.start || !range.end) return;
    // Already carries a time, either from this seeding or from a stored value.
    if (state.timeRange?.start && state.timeRange.end) return;

    const midnight = placeholderIn(timeZone);
    state.setValue({
      start: midnight.set(toCalendarDate(range.start)),
      end: midnight.set(toCalendarDate(range.end)),
    });
  });

  return null;
}

function Clock({
  part,
  label,
  timeZone,
}: {
  part: 'start' | 'end';
  label: string;
  timeZone: string;
}) {
  const state = useContext(DateRangePickerStateContext);
  const value = state?.timeRange?.[part] ?? null;

  return (
    <TimeField
      value={value}
      onChange={(next) => next && state?.setTime(part, next)}
      // No date for this end yet, and a time set now would be dropped.
      isDisabled={!value}
      placeholderValue={placeholderIn(timeZone)}
      granularity="minute"
      hourCycle={12}
      hideTimeZone
      shouldForceLeadingZeros
      className="flex flex-col gap-1"
    >
      <Label className="text-label font-bold tracking-[0.07em] text-ink-3 uppercase">{label}</Label>
      <DateInput className="flex min-h-9 items-center rounded-control border border-border-control bg-surface px-2 text-sm tabular-nums text-ink focus-within:border-primary focus-within:ring-3 focus-within:ring-primary-soft data-disabled:opacity-50">
        {(segment) => <Segment segment={segment} />}
      </DateInput>
    </TimeField>
  );
}

/** The segment being edited is the one the caret is on, so it says so. */
function Segment({
  segment,
}: {
  segment: Parameters<Parameters<typeof DateInput>[0]['children']>[0];
}) {
  return (
    <DateSegment
      segment={segment}
      className={cn(
        'rounded-[4px] px-0.5 tabular-nums outline-none',
        'data-placeholder:text-ink-3',
        'data-focused:bg-primary data-focused:text-primary-fg',
        segment.type === 'literal' && 'px-0 text-ink-3',
        // en-GB writes "pm"; the product writes "PM".
        segment.type === 'dayPeriod' && 'uppercase',
      )}
    />
  );
}
