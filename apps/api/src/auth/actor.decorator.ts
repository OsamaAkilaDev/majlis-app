import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '../generated/prisma/client';

/** Only meaningful behind SessionGuard, i.e. on non-@Public() routes. */
export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  const req = ctx.switchToHttp().getRequest<{ actor: User }>();
  return req.actor;
});
