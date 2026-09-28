import { z } from 'zod';
import { appointmentStatusSchema, clubRoleSchema } from '../common/enums';
import { overrideReasonSchema } from '../common/override';
import { listSchema } from '../common/list';

export { appointmentStatusSchema, clubRoleSchema };

/** LEAD is excluded: appointing a Lead is Admin-only, so admitting it here would let a Lead appoint a co-Lead. */
export const inviteTeamMemberBodySchema = z.object({
  userId: z.uuid(),
  role: z.enum(['VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS']),
  /** Required when an Admin holding no club role invites. */
  overrideReason: overrideReasonSchema.optional(),
});

export const endAppointmentBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const appointmentSchema = z.object({
  id: z.uuid(),
  clubId: z.uuid(),
  userId: z.uuid(),
  userFullName: z.string(),
  /** Omitted, never nulled, without `club:team-manage`: the list is open to any signed-in user, the addresses are not. */
  userEmail: z.string().optional(),
  role: clubRoleSchema,
  status: appointmentStatusSchema,
  invitationExpiresAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  /** True when this officer is no longer an ordinary member of the club. */
  hasLeftClub: z.boolean(),
});

export const invitationSchema = z.object({
  id: z.uuid(),
  clubId: z.uuid(),
  clubName: z.string(),
  clubLogoUrl: z.string(),
  role: clubRoleSchema,
  invitationExpiresAt: z.string(),
});

export const appointmentListSchema = listSchema(appointmentSchema);
export const invitationListSchema = listSchema(invitationSchema);

// ClubRole and AppointmentStatus come from ../common/enums; redeclaring them collides as ambiguous `export *` names.
export type InviteTeamMemberBody = z.infer<typeof inviteTeamMemberBodySchema>;
export type EndAppointmentBody = z.infer<typeof endAppointmentBodySchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type AppointmentList = z.infer<typeof appointmentListSchema>;
export type InvitationList = z.infer<typeof invitationListSchema>;
