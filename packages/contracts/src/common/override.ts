import { z } from 'zod';

/** Always optional on the wire: the same body comes from officers acting in their own right. `overrideReasonFor` decides server-side. */
export const overrideReasonSchema = z.string().trim().min(1).max(500);

/** Defaulted, not merely optional: Express leaves `req.body` undefined when none is sent, and a bare object would answer 400. */
export const overrideBodySchema = z
  .object({ overrideReason: overrideReasonSchema.optional() })
  .optional()
  .default({});

