import { z } from 'zod';
import { clubRoleSchema, membershipStatusSchema } from '../common/enums';
import { overrideBodySchema, overrideReasonSchema } from '../common/override';
import { listSchema } from '../common/list';

export { membershipStatusSchema };

/** LEFT and REMOVED have their own routes and permissions; admitting them here would skip their audit action. */
export const decideMembershipBodySchema = z.object({
  status: z.enum(['ACTIVE', 'REJECTED']),
  reason: z.string().trim().min(1).max(500).optional(),
});

export const addMemberBodySchema = z.object({
  userId: z.uuid(),
  /** Required when an Admin holding no club role adds. */
  overrideReason: overrideReasonSchema.optional(),
});

export const removeMemberBodySchema = overrideBodySchema;

export const memberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  userFullName: z.string(),
  /** Omitted, never nulled, without `membership:decide`: the list is open to any signed-in user, the addresses are not. */
  userEmail: z.string().optional(),
  status: membershipStatusSchema,
  requestedAt: z.string(),
  decidedAt: z.string().nullable(),
  clubRoles: z.array(clubRoleSchema),
});

export const memberListSchema = listSchema(memberSchema);

export const memberListQuerySchema = z.object({
  status: membershipStatusSchema.optional(),
});

export const myClubSchema = z.object({
  clubId: z.uuid(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string(),
  status: membershipStatusSchema,
  clubRoles: z.array(clubRoleSchema),
});

export const myClubListSchema = listSchema(myClubSchema);

// MembershipStatus comes from ../common/enums; redeclaring it collides as an ambiguous `export *` name.
export type DecideMembershipBody = z.infer<typeof decideMembershipBodySchema>;
export type AddMemberBody = z.infer<typeof addMemberBodySchema>;
export type RemoveMemberBody = z.infer<typeof removeMemberBodySchema>;
export type Member = z.infer<typeof memberSchema>;
export type MemberList = z.infer<typeof memberListSchema>;
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
export type MyClub = z.infer<typeof myClubSchema>;
export type MyClubList = z.infer<typeof myClubListSchema>;
