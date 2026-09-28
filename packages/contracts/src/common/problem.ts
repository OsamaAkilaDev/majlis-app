import { z } from 'zod';

/** Shared by DomainError subclasses and the exception filter so the two never drift into different bases. */
export const PROBLEM_BASE = 'https://majlis.app/problems';

export const problemFieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

/** RFC 9457 Problem Details, plus the two extension members Majlis always sends. */
export const problemDetailsSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(problemFieldErrorSchema).optional(),
});

export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
