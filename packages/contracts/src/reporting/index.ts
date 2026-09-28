import { z } from 'zod';
import { listSchema } from '../common/list';

/** Platform totals, Admin only. */
export const overviewReportSchema = z.object({
  clubsByStatus: z.record(z.string(), z.number().int()),
  eventsByStatus: z.record(z.string(), z.number().int()),
  users: z.number().int(),
  activeMemberships: z.number().int(),
  certificatesIssued: z.number().int(),
});

/** `attendanceRate` is attended over expected, which excludes the waitlist. 0, not NaN, when nothing was expected. */
export const clubReportSchema = z.object({
  clubId: z.uuid(),
  events: z.number().int(),
  registrations: z.number().int(),
  expected: z.number().int(),
  attended: z.number().int(),
  attendanceRate: z.number().min(0).max(1),
  certificatesIssued: z.number().int(),
});

export const auditEntrySchema = z.object({
  id: z.uuid(),
  actorUserId: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  outcome: z.enum(['SUCCESS', 'DENIED']),
  reason: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  requestId: z.string(),
  ip: z.string().nullable(),
  createdAt: z.string(),
});

export const auditListSchema = listSchema(auditEntrySchema);

export type OverviewReport = z.infer<typeof overviewReportSchema>;
export type ClubReport = z.infer<typeof clubReportSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditList = z.infer<typeof auditListSchema>;
