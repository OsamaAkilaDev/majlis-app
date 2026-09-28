import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UnauthorizedError } from '../common/problem/domain-error';
import type { User } from '../generated/prisma/client';
import { TransactionHost } from '../prisma/transaction.host';
import { SESSION_COOKIE } from './cookies';
import { IS_PUBLIC_KEY } from './public.decorator';

declare module 'express' {
  interface Request {
    actor?: User;
  }
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Global APP_GUARD. PermissionsGuard reads `req.actor`, so it must be registered after this one. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly host: TransactionHost,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const userId = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!userId || !UUID_SHAPE.test(userId)) throw new UnauthorizedError('Not signed in.');

    // Loaded every request so suspension applies immediately.
    const user = await this.host.tx.user.findUnique({ where: { id: userId } });
    // Generic: "suspended" is only said on login, after the password is proven.
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('Not signed in.');

    req.actor = user;
    return true;
  }
}
