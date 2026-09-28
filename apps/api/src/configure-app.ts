import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { setupOpenApi } from './common/openapi';
import { ProblemExceptionFilter } from './common/problem/problem.filter';
import { RequestContext } from './common/request-context';
import { resolveRequestId } from './common/request-id';
import { API_PREFIX } from './config/api-prefix';

/** Shared by main.ts and the integration tests so both run the same bootstrap. */
export function configureApp(app: INestApplication): void {
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.use(cookieParser());

  // app.use(), not forRoutes('*'), which Express 5 rejects.
  // Assigns req.id itself: this runs before pino-http, which adopts it, so logs and audit rows share an id.
  const requestContext = app.get(RequestContext);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    req.id = requestId;
    res.setHeader('x-request-id', requestId);

    requestContext.run(
      {
        requestId,
        ip: req.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      },
      next,
    );
  });

  // API_PREFIX's leading slash is load-bearing; see api-prefix.ts.
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new ZodValidationPipe());
  // Unknown response keys are stripped, and a mismatch is a 500.
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new ProblemExceptionFilter(logger));
  app.enableShutdownHooks();

  setupOpenApi(app);
}
