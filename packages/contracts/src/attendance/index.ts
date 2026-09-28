import { z } from 'zod';
import { emailSchema } from '../auth';
import { listSchema } from '../common/list';
import { overrideReasonSchema } from '../common/override';
import { eventStatusSchema, registrationStatusSchema } from '../events';

export const attendanceMethodSchema = z.enum(['MANUAL']);

export const manualCheckInBodySchema = z.object({
  email: emailSchema,
  reason: z.string().trim().min(1).max(500),
});

const holder = {
  fullName: z.string(),
  email: z.string(),
  checkedInAt: z.string(),
};

/**
 * Outcomes the operator reads off the screen, so all 200s; only "not authorised" is an HTTP fault.
 * Only the success shapes carry personal data.
 */
export const checkInResultSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('CHECKED_IN'), ...holder }),
  z.object({ result: z.literal('ALREADY_CHECKED_IN'), ...holder }),
  z.object({ result: z.literal('NOT_REGISTERED') }),
  z.object({ result: z.literal('REGISTRATION_CANCELLED') }),
  z.object({ result: z.literal('EVENT_NOT_OPEN'), eventStatus: eventStatusSchema }),
]);

export const attendanceRowSchema = z.object({
  /** The registration id: the roster is the registration list, with attendance on it. */
  id: z.uuid(),
  userId: z.uuid(),
  fullName: z.string(),
  email: z.string(),
  registrationStatus: registrationStatusSchema,
  checkedInAt: z.string().nullable(),
  method: attendanceMethodSchema.nullable(),
});

/** Counts registrations that held a confirmed place: a waitlisted student is not expected in the room. */
export const attendanceListSchema = listSchema(attendanceRowSchema).extend({
  checkedIn: z.number().int(),
  expected: z.number().int(),
});

/**
 * `present` is the asserted state, not a toggle, so a retried correction is idempotent.
 * `override` is an Admin's separate reason for correcting after certificates issued.
 */
export const correctAttendanceBodySchema = z.object({
  present: z.boolean(),
  reason: z.string().trim().min(1).max(500),
  override: z.object({ reason: overrideReasonSchema }).optional(),
});

export type AttendanceMethod = z.infer<typeof attendanceMethodSchema>;
export type ManualCheckInBody = z.infer<typeof manualCheckInBodySchema>;
export type CheckInResult = z.infer<typeof checkInResultSchema>;
export type AttendanceList = z.infer<typeof attendanceListSchema>;
export type CorrectAttendanceBody = z.infer<typeof correctAttendanceBodySchema>;
