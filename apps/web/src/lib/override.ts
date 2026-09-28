import type { ClubRole, SessionUser } from '@majlis/contracts';

/** Mirrors the API's `overrideReasonFor`. Presentation only; the server re-derives and enforces it. */
export function needsOverrideReason(
  platformRole: SessionUser['platformRole'],
  viewerClubRoles: readonly ClubRole[],
): boolean {
  return platformRole === 'ADMIN' && viewerClubRoles.length === 0;
}
