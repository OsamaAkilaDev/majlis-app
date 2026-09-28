'use client';

import type { ImageKind } from '@majlis/contracts';
import { UploadSimple } from '@phosphor-icons/react/ssr';
import { useId, useState } from 'react';
import { convertToWebp } from '@/lib/image';
import { mintClubEditUpload, mintClubLogoUpload } from '@/lib/clubs';
import { problemMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ICON_WEIGHT } from '@/lib/icons';

type State = 'idle' | 'converting' | 'uploading' | 'done' | 'refused';

const LABELS: Record<ImageKind, string> = {
  'club-logo': 'Logo',
  'club-banner': 'Banner',
  'event-poster': 'Poster',
};

/** WebP in the browser, then PUT to a signed URL whose token is the only credential. */
export function ImageUpload({
  kind,
  clubId,
  currentUrl,
  mint,
  compact,
  onUploaded,
}: {
  kind: ImageKind;
  clubId?: string;
  currentUrl?: string | null;
  mint?: () => Promise<{ signedUrl: string; publicUrl: string; id: string }>;
  /** Icon only; the word moves to the accessible name. */
  compact?: boolean;
  /** Awaited: a rejection is reported like a failed upload. */
  onUploaded: (publicUrl: string, id: string) => void | Promise<void>;
}) {
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const inputId = useId();
  const label = LABELS[kind];

  async function mintFor(): Promise<{ signedUrl: string; publicUrl: string; id: string }> {
    if (mint) return mint();
    if (clubId) return { ...(await mintClubEditUpload(clubId, kind)), id: clubId };
    const { clubId: id, ...rest } = await mintClubLogoUpload();
    return { ...rest, id };
  }

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setState('converting');
    setMessage('');
    try {
      const blob = await convertToWebp(file, kind);

      setState('uploading');
      const { signedUrl, publicUrl, id } = await mintFor();

      const res = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp' },
        body: blob,
      });
      if (!res.ok) throw new Error('The upload was refused. Try again.');

      await onUploaded(publicUrl, id);
      setPreview(publicUrl);
      setState('done');
    } catch (err) {
      setState('refused');
      setMessage(
        problemMessage(err, err instanceof Error ? err.message : 'That upload failed. Try again.'),
      );
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {preview ? (
        <img
          src={preview}
          alt=""
          className={cn(
            'border border-border bg-surface-2 object-cover',
            kind === 'club-logo' ? 'size-20 rounded-card' : 'h-24 w-full rounded-card',
          )}
        />
      ) : null}

      <div className="flex items-center gap-2">
        {/* Before the label as a `peer`, so the label shows the sr-only input's focus. */}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          onChange={onChange}
          disabled={state === 'converting' || state === 'uploading'}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          aria-label={compact ? `Replace ${label.toLowerCase()}` : undefined}
          title={compact ? `Replace ${label.toLowerCase()}` : undefined}
          className={cn(
            'cursor-pointer peer-focus-visible:focus-ring',
            compact
              ? 'grid size-7 place-items-center rounded-control border border-border bg-surface text-ink shadow-[var(--shadow-sm)] hover:bg-surface-2'
              : 'inline-flex h-8 items-center rounded-control border border-border-control px-2.5 text-sm font-medium text-ink hover:bg-surface-2',
          )}
        >
          {compact ? <UploadSimple size={14} weight={ICON_WEIGHT} aria-hidden /> : label}
        </label>
      </div>

      <p aria-live="polite" className="text-sm text-ink-2 empty:hidden">
        {state === 'converting' ? 'Converting...' : state === 'uploading' ? 'Uploading...' : ''}
      </p>
      {state === 'refused' ? (
        <p role="alert" className="text-sm text-bad-fg">
          {message}
        </p>
      ) : null}
    </div>
  );
}
