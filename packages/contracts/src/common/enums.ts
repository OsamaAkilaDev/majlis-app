import { z } from 'zod';

export const clubRoleSchema = z.enum(['LEAD', 'VICE_LEAD', 'MARKETING', 'CTO', 'OPERATIONS']);

export const membershipStatusSchema = z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'LEFT', 'REMOVED']);

export const appointmentStatusSchema = z.enum(['INVITED', 'ACTIVE', 'DECLINED', 'EXPIRED', 'ENDED']);

export type ClubRole = z.infer<typeof clubRoleSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/** Here, not in ../events: ../clubs names it and ../events imports ../clubs, a cycle Zod cannot survive at init. */
export const eventStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'REGISTRATION_CLOSED',
  'ONGOING',
  'COMPLETED',
  'CERTIFIED',
  'CANCELLED',
]);

export type EventStatus = z.infer<typeof eventStatusSchema>;
