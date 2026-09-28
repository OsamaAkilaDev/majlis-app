import type { ImageKind } from '@majlis/contracts';

// Public: branding images would otherwise need a signing round trip each.
export const STORAGE_BUCKET = 'majlis-storage';

const PATHS = {
  'club-logo': { folder: 'clubs', file: 'logo.webp' },
  'club-banner': { folder: 'clubs', file: 'banner.webp' },
  'event-poster': { folder: 'events', file: 'poster.webp' },
} as const satisfies Record<ImageKind, { folder: string; file: string }>;

// Ids come from request params, so a separator or dot segment would escape the authorized folder.
function safeSegment(id: string): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) {
    throw new Error(`Unsafe resource id for a storage path: ${JSON.stringify(id)}`);
  }
  return id;
}

export function objectPath(kind: ImageKind, resourceId: string): string {
  const spec = PATHS[kind];
  return `${spec.folder}/${safeSegment(resourceId)}/${spec.file}`;
}

// Names are reused on replacement, so the version query is the only cache buster.
export function publicUrl(baseUrl: string, path: string, version: number): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${path}?v=${version}`;
}
