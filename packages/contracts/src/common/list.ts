import { z } from 'zod';

export function listSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item) });
}
