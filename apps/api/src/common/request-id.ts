import { randomUUID } from 'node:crypto';

/** Strict, because a caller-supplied id lands verbatim in the append-only audit log. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._~-]{1,64}$/;

export function resolveRequestId(headerValue: unknown): string {
  return typeof headerValue === 'string' && REQUEST_ID_PATTERN.test(headerValue)
    ? headerValue
    : randomUUID();
}
