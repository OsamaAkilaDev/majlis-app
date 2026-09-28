'use client';

import { WarningCircle } from '@phosphor-icons/react/ssr';
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { ICON_WEIGHT } from '@/lib/icons';

export function Field({
  label,
  error,
  constraint,
  group,
  children,
}: {
  label: string;
  error?: string | undefined;
  /** Sits on the label row, not as a sentence below the control. */
  constraint?: ReactNode;
  /** For a control no `<label htmlFor>` reaches (a Select, an upload); it must carry its own aria-label. */
  group?: boolean;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const labelId = `${id}-label`;
  const describedBy = error ? errorId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        {group ? (
          <span id={labelId} className="text-sm font-semibold text-ink">
            {label}
          </span>
        ) : (
          <label htmlFor={id} className="text-sm font-semibold text-ink">
            {label}
          </label>
        )}
        {constraint}
      </div>
      {group ? (
        // No role="group": each control names itself, and a same-named group made each announce twice.
        children
      ) : (
        cloneElement(children, {
          id,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': describedBy,
        })
      )}
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-bad-fg">
          <WarningCircle size={14} weight={ICON_WEIGHT} className="shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** After a refused submit, focus the first field the server named, a frame later so the errors have painted. */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
