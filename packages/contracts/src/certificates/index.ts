import { z } from 'zod';
import { listSchema } from '../common/list';

export const certificateStatusSchema = z.enum(['ACTIVE', 'REVOKED']);

/** The snapshot fields are what was stored at issuance, so renaming a club cannot alter an issued certificate. */
export const certificateSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  userId: z.uuid(),
  serialNumber: z.string(),
  verificationCode: z.string(),
  status: certificateStatusSchema,
  holderName: z.string(),
  eventTitle: z.string(),
  clubName: z.string(),
  clubLogoUrl: z.string(),
  issuedAt: z.string(),
  revokedAt: z.string().nullable(),
  revokedReason: z.string().nullable(),
});

export const certificateListSchema = listSchema(certificateSchema);

export const certificateIssueResultSchema = z.object({
  issued: z.number().int(),
  total: z.number().int(),
});

/** A reason is required: an unexplained revocation is indistinguishable from a bug in the audit log. */
export const revokeCertificateBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CertificateStatus = z.infer<typeof certificateStatusSchema>;
export type Certificate = z.infer<typeof certificateSchema>;
export type CertificateList = z.infer<typeof certificateListSchema>;
export type CertificateIssueResult = z.infer<typeof certificateIssueResultSchema>;
export type RevokeCertificateBody = z.infer<typeof revokeCertificateBodySchema>;
