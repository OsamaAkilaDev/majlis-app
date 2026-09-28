import { describe, expect, it } from 'vitest';
import { objectPath, publicUrl } from './image-kinds';

describe('objectPath', () => {
  it('builds a path under the kind folder from the resource id', () => {
    expect(objectPath('club-logo', 'abc')).toBe('clubs/abc/logo.webp');
    expect(objectPath('club-banner', 'abc')).toBe('clubs/abc/banner.webp');
  });

  it('refuses a resource id containing a path separator', () => {
    // The id comes from a request parameter; unchecked, "../" escapes the folder.
    expect(() => objectPath('club-logo', '../site')).toThrow(/resource id/i);
    expect(() => objectPath('club-logo', 'a/b')).toThrow(/resource id/i);
  });

  it('refuses an empty resource id', () => {
    expect(() => objectPath('club-logo', '')).toThrow(/resource id/i);
  });
});

describe('publicUrl', () => {
  it('carries a version query so a replacement is a distinct URL', () => {
    // Object names are deterministic, so without ?v= caches serve the old bytes.
    const url = publicUrl('https://x.supabase.co', 'clubs/abc/logo.webp', 1700000000000);
    expect(url).toBe(
      'https://x.supabase.co/storage/v1/object/public/majlis-storage/clubs/abc/logo.webp?v=1700000000000',
    );
  });

  it('does not double a slash when the base URL has a trailing one', () => {
    expect(publicUrl('https://x.supabase.co/', 'clubs/abc/logo.webp', 1)).not.toContain('.co//');
  });
});
