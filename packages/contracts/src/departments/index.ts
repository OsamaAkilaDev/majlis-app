import { z } from 'zod';
import { listSchema } from '../common/list';

export const createDepartmentBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().regex(/^[A-Z0-9]{2,10}$/, 'must be 2 to 10 uppercase letters or digits'),
  description: z.string().trim().max(500).optional(),
});

export const patchDepartmentBodySchema = createDepartmentBodySchema.partial();

export const departmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  clubCount: z.number().int().nonnegative(),
});

export const departmentListSchema = listSchema(departmentSchema);

export type CreateDepartmentBody = z.infer<typeof createDepartmentBodySchema>;
export type PatchDepartmentBody = z.infer<typeof patchDepartmentBodySchema>;
export type Department = z.infer<typeof departmentSchema>;
export type DepartmentList = z.infer<typeof departmentListSchema>;
