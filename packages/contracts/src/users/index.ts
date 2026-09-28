import { z } from 'zod';
import { emailSchema } from '../auth';
import { listSchema } from '../common/list';

/** Declared locally: this package does not depend on Prisma's runtime. */
export const userStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);

/** Zod 4's `.url()` accepts `javascript:` and `data:`; this is echoed into an admin's browser, so https only. */
const httpsUrlSchema = z.string().trim().max(2048).refine(
  (v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'must be an https:// URL' },
);

/** Excludes `clubRoles`, so a profile-edit response carries no authorization facts. */
export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  platformRole: z.enum(['STUDENT', 'ADMIN']),
  status: userStatusSchema,
});

/** The only fields a user may change about themselves. The service also picks them explicitly; this is a second layer. */
export const patchMeBodySchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  avatarUrl: httpsUrlSchema.nullable().optional(),
});

export const userListItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  platformRole: z.enum(['STUDENT', 'ADMIN']),
  status: userStatusSchema,
  createdAt: z.string(),
});

export const userListSchema = listSchema(userListItemSchema);

/** `q` matches name or address: an admin has whichever they were given. */
export const userListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
});

/** Narrower than `userListItemSchema`: a club Lead has no business reading platform role, status or creation date. */
export const userSearchItemSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
});

/** Capped, so a caller cannot walk the whole directory. */
export const userSearchResultSchema = z.object({ items: z.array(userSearchItemSchema) });

/** Minimum two characters, so the route is not a blank-query dump of every account. */
export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export const patchUserStatusBodySchema = z.object({
  status: userStatusSchema,
  reason: z.string().trim().min(1).max(500),
});

/**
 * `reason` required: one person acting on another's record. An empty patch is refused by the service, which can say what was missing.
 * `email` reuses `emailSchema` so it matches the lowercase CHECK on `user.email`.
 */
export const patchUserBodySchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  email: emailSchema.optional(),
  avatarUrl: httpsUrlSchema.nullable().optional(),
  platformRole: z.enum(['STUDENT', 'ADMIN']).optional(),
  reason: z.string().trim().min(1).max(500),
});

export type UserStatus = z.infer<typeof userStatusSchema>;
export type PatchUserBody = z.infer<typeof patchUserBodySchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type Me = UserProfile;
export type PatchMeBody = z.infer<typeof patchMeBodySchema>;
export type UserListItem = z.infer<typeof userListItemSchema>;
export type UserList = z.infer<typeof userListSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserSearchItem = z.infer<typeof userSearchItemSchema>;
export type UserSearchResult = z.infer<typeof userSearchResultSchema>;
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;
export type PatchUserStatusBody = z.infer<typeof patchUserStatusBodySchema>;
