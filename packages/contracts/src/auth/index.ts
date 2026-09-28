import { z } from 'zod';
import { PASSWORD_MIN } from '../constants';

export { PASSWORD_MIN };

/**
 * Shared by signup and login: an un-normalised login lookup has no CHECK backstop and reports "invalid credentials".
 * Trim before `.email()`, or a pasted " Foo@Bar.com " is rejected.
 */
export const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((v) => v.toLowerCase());

export const signupBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`),
  fullName: z.string().trim().min(1).max(120),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

/** `role` is a plain string on purpose: permissions.ts owns the one role union kept in step with Prisma. */
export const sessionClubRoleSchema = z.object({
  clubId: z.string(),
  clubName: z.string(),
  role: z.string(),
});

/** Never includes `password`. */
export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  platformRole: z.enum(['STUDENT', 'ADMIN']),
  clubRoles: z.array(sessionClubRoleSchema),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** Always answers 202, or the endpoint is an account-existence oracle. Timing is not equalised, an accepted limit. */
export const forgotPasswordBodySchema = z.object({ email: emailSchema });

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1, 'A reset token is required.'),
  password: z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`),
});

/**
 * Does NOT consume the token: the screen resolves it on first paint, so a consuming preview would fail every reset.
 * Disclosing the address costs nothing, since the token holder can take the account anyway.
 */
export const resetPasswordPreviewQuerySchema = z.object({
  token: z.string().min(1, 'A reset token is required.'),
});

export const resetPasswordPreviewSchema = z.object({ email: z.string() });

export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type ResetPasswordPreviewQuery = z.infer<typeof resetPasswordPreviewQuerySchema>;
export type ResetPasswordPreview = z.infer<typeof resetPasswordPreviewSchema>;
