import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ForgotPasswordBody,
  LoginBody,
  ResetPasswordBody,
  ResetPasswordPreview,
  ResetPasswordPreviewQuery,
  SessionUser,
  SignupBody,
} from '@majlis/contracts';
import { AuditService } from '../audit/audit.service';
import { ForbiddenError, UnauthorizedError } from '../common/problem/domain-error';
import { conflictOn } from '../common/prisma-constraint';
import type { User } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';
import { NotificationService } from '../notifications/notification.service';
import type { Env } from '../config/env.schema';

/** A reset link is a bearer credential sitting in an inbox. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** One message for expired, used, unknown and suspended, so none can be told apart. */
export const RESET_LINK_INVALID = 'That password reset link is no longer valid.';

/** Every P2002 on `user` is the unique email index. */
export const emailConflict = conflictOn({ email: 'An account with this email already exists.' });

export interface AuthResult {
  user: SessionUser;
  userId: string;
}

function mintResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashResetToken(raw) };
}

function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly webOrigin: string;

  constructor(
    private readonly host: TransactionHost,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    config: ConfigService<Env, true>,
  ) {
    this.webOrigin = config.get('PUBLIC_WEB_ORIGIN', { infer: true }).replace(/\/+$/, '');
  }

  async signup(input: SignupBody): Promise<AuthResult> {
    const user = await this.host.tx.user
      .create({ data: { email: input.email, password: input.password, fullName: input.fullName } })
      .catch(emailConflict);
    return { user: await this.buildSessionUser(user), userId: user.id };
  }

  async login(input: LoginBody): Promise<AuthResult> {
    const user = await this.host.tx.user.findUnique({ where: { email: input.email } });
    if (!user || user.password !== input.password) {
      throw new UnauthorizedError('Email or password is incorrect.');
    }

    // Checked only after the password is proven, so it leaks nothing to a guesser.
    if (user.status !== 'ACTIVE') throw new ForbiddenError('This account is suspended.');

    return { user: await this.buildSessionUser(user), userId: user.id };
  }

  /**
   * Same empty answer for every address, or this is an account-existence oracle.
   * Delivered inline, so the raw link is never stored.
   */
  async forgotPassword(input: ForgotPasswordBody): Promise<void> {
    const user = await this.host.tx.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== 'ACTIVE') return;

    const { raw, hash: tokenHash } = mintResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    const delivered = await this.notifications.deliverNow({
      type: 'auth.password_reset',
      payload: {
        resetUrl: `${this.webOrigin}/reset-password?token=${raw}`,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      },
      recipientEmail: user.email,
      recipientName: user.fullName,
    });

    await this.host.run(async () => {
      const token = await this.host.tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      await this.notifications.record({
        userId: user.id,
        type: 'auth.password_reset',
        // Per token, so a second request is not deduplicated into the first.
        subject: token.id,
        payload: { expiresInMinutes: PASSWORD_RESET_TTL_MINUTES },
        delivered,
      });

      // No actorUserId: whoever typed the address has not proven who they are.
      await this.audit.record({
        action: 'auth.password_reset_requested',
        entityType: 'User',
        entityId: user.id,
      });
    });
  }

  /** Duplicates resetPassword's predicate on purpose: this must never write usedAt. */
  async previewReset(query: ResetPasswordPreviewQuery): Promise<ResetPasswordPreview> {
    const tokenHash = hashResetToken(query.token);
    const row = await this.host.tx.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      select: { user: { select: { email: true, status: true } } },
    });
    if (!row || row.user.status !== 'ACTIVE') throw new UnauthorizedError(RESET_LINK_INVALID);
    return { email: row.user.email };
  }

  /** Single use via a conditional UPDATE, so two racing requests cannot both spend the token. */
  async resetPassword(input: ResetPasswordBody): Promise<void> {
    const tokenHash = hashResetToken(input.token);

    await this.host.run(async () => {
      const now = new Date();
      const { count } = await this.host.tx.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count === 0) throw new UnauthorizedError(RESET_LINK_INVALID);

      const row = await this.host.tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } });
      const user = await this.host.tx.user.findUniqueOrThrow({ where: { id: row.userId } });
      if (user.status !== 'ACTIVE') throw new UnauthorizedError(RESET_LINK_INVALID);

      await this.host.tx.user.update({ where: { id: user.id }, data: { password: input.password } });

      await this.audit.record({
        action: 'auth.password_reset',
        entityType: 'User',
        entityId: user.id,
        actorUserId: user.id,
      });
    });
  }

  async me(user: User): Promise<SessionUser> {
    return this.buildSessionUser(user);
  }

  /** Includes club roles so the client can pick a shell without a second request. */
  private async buildSessionUser(user: User): Promise<SessionUser> {
    const appointments = await this.host.tx.clubTeamAppointment.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { clubId: true, role: true, club: { select: { name: true } } },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      platformRole: user.platformRole,
      clubRoles: appointments.map((a) => ({
        clubId: a.clubId,
        clubName: a.club.name,
        role: a.role,
      })),
    };
  }
}
