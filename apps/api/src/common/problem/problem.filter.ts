import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { PROBLEM_BASE, type ProblemDetails, type ProblemFieldError } from '@majlis/contracts';
import type { Logger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { DomainError } from './domain-error';

function isPrismaError(e: unknown): e is { code: string; message: string } {
  return typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string';
}

type ZodIssue = ZodError['issues'][number];

/** Rewrites only Zod's defaults; a hand-written schema message passes through untouched. */
function readable(i: ZodIssue): string {
  const m = i.message;
  if (i.code === 'too_small' && m.startsWith('Too small')) {
    const min = Number(i.minimum);
    if (i.origin === 'string') return min <= 1 ? 'Required' : `Use at least ${min} characters`;
    if (i.origin === 'array' || i.origin === 'set') return `Choose at least ${min}`;
    return `At least ${min}`;
  }
  if (i.code === 'too_big' && m.startsWith('Too big')) {
    const max = Number(i.maximum);
    if (i.origin === 'string') return `Use at most ${max} characters`;
    if (i.origin === 'array' || i.origin === 'set') return `Choose at most ${max}`;
    return `At most ${max}`;
  }
  if (i.code === 'invalid_type' && m.endsWith('received undefined')) return 'Required';
  return m;
}

function asZodError(e: unknown): ZodError | undefined {
  if (e instanceof ZodError) return e;
  if (e instanceof ZodValidationException) {
    const inner = e.getZodError();
    if (inner instanceof ZodError) return inner;
  }
  return undefined;
}

@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<{ url?: string; originalUrl?: string; id?: string }>();
    const res = http.getResponse<{
      type: (t: string) => { status: (s: number) => { json: (b: unknown) => void } };
    }>();

    const problem = this.toProblem(exception, req);

    if (problem.status >= 500) {
      this.logger.error({ err: exception, requestId: problem.requestId }, 'Unhandled exception');
    } else {
      this.logger.warn({ requestId: problem.requestId, status: problem.status }, problem.title);
    }

    res.type('application/problem+json').status(problem.status).json(problem);
  }

  private toProblem(
    exception: unknown,
    req: { url?: string; originalUrl?: string; id?: string },
  ): ProblemDetails {
    // originalUrl, because a mounted sub-router rewrites req.url relative to its mount point.
    const base = { instance: req.originalUrl ?? req.url, requestId: req.id };

    if (exception instanceof DomainError) {
      return {
        ...base,
        type: exception.type,
        title: exception.title,
        status: exception.status,
        detail: exception.message,
      };
    }

    // Before HttpException: ZodValidationException extends it and would lose its field errors.
    const zodError = asZodError(exception);
    if (zodError) {
      const errors: ProblemFieldError[] = zodError.issues.map((i) => ({
        path: i.path.join('.'),
        message: readable(i),
        code: i.code,
      }));
      return {
        ...base,
        type: `${PROBLEM_BASE}/validation-failed`,
        title: 'Validation failed',
        status: 400,
        detail: 'The request did not match the expected shape.',
        errors,
      };
    }

    if (isPrismaError(exception)) {
      // A lost race on a unique index is expected, never a 500.
      if (exception.code === 'P2002') {
        return {
          ...base,
          type: `${PROBLEM_BASE}/conflict`,
          title: 'Conflict',
          status: 409,
          detail: 'This conflicts with an existing record. Reload and try again.',
        };
      }
      if (exception.code === 'P2025') {
        return {
          ...base,
          type: `${PROBLEM_BASE}/not-found`,
          title: 'Not found',
          status: 404,
          detail: 'The requested record does not exist.',
        };
      }
      if (exception.code === 'P2003') {
        return {
          ...base,
          type: `${PROBLEM_BASE}/conflict`,
          title: 'Conflict',
          status: 409,
          detail: 'A referenced record does not exist or is still in use.',
        };
      }
      // A malformed uuid is a 400, not a 500 whose logged message could embed a password.
      // The docs say P2023; the pg driver adapter actually raises P2007. Both handled.
      if (exception.code === 'P2023' || exception.code === 'P2007') {
        return {
          ...base,
          type: `${PROBLEM_BASE}/validation-failed`,
          title: 'Validation failed',
          status: 400,
          detail: 'The request contained a malformed identifier.',
        };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const detail =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message as string | undefined);
      return {
        ...base,
        type: `${PROBLEM_BASE}/http-error`,
        title: exception.name.replace(/Exception$/, ''),
        status,
        detail: Array.isArray(detail) ? detail.join('; ') : (detail ?? exception.message),
      };
    }

    // The cause is logged; the client gets only a request id.
    return {
      ...base,
      type: `${PROBLEM_BASE}/internal`,
      title: 'Internal server error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred.',
    };
  }
}
