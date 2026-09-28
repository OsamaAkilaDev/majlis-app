import { z } from 'zod';
import { clubRoleSchema, membershipStatusSchema } from '../common/enums';
import { listSchema } from '../common/list';

export const clubStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']);
export const membershipPolicySchema = z.enum(['OPEN', 'APPROVAL_REQUIRED', 'INVITE_ONLY', 'CLOSED']);

/** Zod 4's .url() checks shape, not scheme, and every stored URL is rendered into a browser. */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be an https URL');

export const academicYearSchema = z
  .string()
  .trim()
  .regex(/^\d{4}\/\d{4}$/, 'must look like 2026/2027')
  .refine((v) => {
    const [from, to] = v.split('/').map(Number) as [number, number];
    return to === from + 1;
  }, 'must be two consecutive years');

/** No `logoUrl`: the server never stores a client-supplied image URL; it builds one after verifying the upload. */
export const createClubBodySchema = z.object({
  clubId: z.uuid(),
  departmentId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(2).max(60),
  academicYear: academicYearSchema,
  membershipPolicy: membershipPolicySchema,
});

/** No image URLs, for the same reason. `logoUploaded`/`bannerUploaded` ask the server to verify the upload at its path. */
export const patchClubBodySchema = z
  .object({
    departmentId: z.uuid(),
    description: z.string().trim().min(1).max(2000),
    category: z.string().trim().min(2).max(60),
    academicYear: academicYearSchema,
    membershipPolicy: membershipPolicySchema,
    logoUploaded: z.boolean(),
    bannerUploaded: z.boolean(),
    /** Required when an Admin holding no club role edits. */
    overrideReason: z.string().trim().min(1).max(500),
  })
  .partial();

export const patchClubStatusBodySchema = z.object({
  status: clubStatusSchema,
  reason: z.string().trim().min(1).max(500),
});

export const appointLeadBodySchema = z.object({ userId: z.uuid() });

export const imageKindSchema = z.enum(['club-logo', 'club-banner', 'event-poster']);

export type ImageKind = z.infer<typeof imageKindSchema>;

/** Shared by the API and the browser converter so they cannot drift. Every upload is centre-cropped to its box. */
export const IMAGE_KINDS = {
  'club-logo': { maxBytes: 256 * 1024, box: { w: 512, h: 512 } },
  'club-banner': { maxBytes: 512 * 1024, box: { w: 1600, h: 400 } },
  'event-poster': { maxBytes: 512 * 1024, box: { w: 1600, h: 900 } },
} as const satisfies Record<ImageKind, { maxBytes: number; box: { w: number; h: number } }>;

export function imageAspectRatio(kind: ImageKind): string {
  const { box } = IMAGE_KINDS[kind];
  return `${box.w} / ${box.h}`;
}

export const signedUploadSchema = z.object({
  path: z.string(),
  signedUrl: z.url(),
  token: z.string(),
  /** The URL to store once the upload succeeds, version suffix included. */
  publicUrl: httpsUrlSchema,
});

/** Also mints the id the club will be created with. */
export const newClubUploadSchema = signedUploadSchema.extend({ clubId: z.uuid() });

export const clubSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  logoUrl: z.string(),
  status: clubStatusSchema,
  membershipPolicy: membershipPolicySchema,
  departmentName: z.string(),
  memberCount: z.number().int().nonnegative(),
  /** The viewer's own relationship: in this club or waiting on it. Never another user's. */
  viewerJoined: z.boolean(),
});

export const committeeMemberSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  role: clubRoleSchema,
  /** When the appointment was accepted. No address: the club page is open to every signed-in user. */
  since: z.string().nullable(),
});

export const clubDetailSchema = clubSummarySchema.extend({
  description: z.string(),
  academicYear: z.string(),
  bannerUrl: z.string().nullable(),
  departmentId: z.uuid(),
  /** The viewer's own relationship to this club. Never another user's. */
  viewerMembershipStatus: membershipStatusSchema.nullable(),
  viewerClubRoles: z.array(clubRoleSchema),
  committee: z.array(committeeMemberSchema),
  /** Null, never 0, without `membership:decide`: "you may not see this" and "there are none" differ. */
  pendingMemberCount: z.number().int().nonnegative().nullable(),
  /** COMPLETED or CERTIFIED. */
  eventsRun: z.number().int().nonnegative(),
});

export const clubListSchema = listSchema(clubSummarySchema);

export const clubListQuerySchema = z.object({
  status: clubStatusSchema.optional(),
  /** Hides clubs the viewer is ACTIVE or PENDING in. */
  joinable: z.stringbool().optional(),
});

export type ClubStatus = z.infer<typeof clubStatusSchema>;
export type MembershipPolicy = z.infer<typeof membershipPolicySchema>;
export type CreateClubBody = z.infer<typeof createClubBodySchema>;
export type PatchClubBody = z.infer<typeof patchClubBodySchema>;
export type PatchClubStatusBody = z.infer<typeof patchClubStatusBodySchema>;
export type AppointLeadBody = z.infer<typeof appointLeadBodySchema>;
export type SignedUpload = z.infer<typeof signedUploadSchema>;
export type NewClubUpload = z.infer<typeof newClubUploadSchema>;
export type ClubSummary = z.infer<typeof clubSummarySchema>;
export type CommitteeMember = z.infer<typeof committeeMemberSchema>;
export type ClubDetail = z.infer<typeof clubDetailSchema>;
export type ClubList = z.infer<typeof clubListSchema>;
export type ClubListQuery = z.infer<typeof clubListQuerySchema>;
