/** "Layla Al Mansoori" -> "LA". No 'use client': Server Components use it too. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}
