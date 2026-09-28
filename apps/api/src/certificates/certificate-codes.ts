import { randomBytes } from 'node:crypto';

/** Crockford base32: no I, L, O or U, so codes read aloud cannot be confused. Not RFC 4648. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Unbiased only because 32 divides 256. */
function crockford(length: number): string {
  return Array.from(randomBytes(length), (b) => CROCKFORD[b % CROCKFORD.length]).join('');
}

const SERIAL_CHARS = 8;

/** 30 chars at 5 bits is 150 bits, above the 128-bit floor. */
const CODE_GROUPS = 6;
const GROUP_SIZE = 5;

export function serialNumber(now = new Date()): string {
  return `MJL-${now.getUTCFullYear()}-${crockford(SERIAL_CHARS)}`;
}

export function verificationCode(): string {
  return Array.from({ length: CODE_GROUPS }, () => crockford(GROUP_SIZE)).join('-');
}
