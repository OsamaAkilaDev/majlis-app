import { ConflictError } from './problem/domain-error';
import { Prisma } from '../generated/prisma/client';

/** Prisma 7's driver adapter never fills `meta.target`; the index name is under `driverAdapterError`. */
export function violatedConstraintName(meta: unknown): string {
  if (!meta || typeof meta !== 'object') return '';
  const m = meta as Record<string, unknown>;
  const target = m.target;
  if (Array.isArray(target)) return target.join(',');
  if (typeof target === 'string') return target;

  const cause = (m.driverAdapterError as Record<string, unknown> | undefined)?.cause as
    | Record<string, unknown>
    | undefined;
  const index = (cause?.constraint as Record<string, unknown> | undefined)?.index;
  if (typeof index === 'string') return index;
  return typeof cause?.originalMessage === 'string' ? cause.originalMessage : '';
}

export function isUniqueViolation(e: unknown, needle: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    violatedConstraintName(e.meta).includes(needle)
  );
}

/** Keys are index-name substrings. No default branch: it would fire even when name extraction broke. */
export function conflictOn(messages: Record<string, string>): (e: unknown) => never {
  return (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const constraint = violatedConstraintName(e.meta);
      for (const [needle, message] of Object.entries(messages)) {
        if (constraint.includes(needle)) throw new ConflictError(message);
      }
    }
    throw e;
  };
}
