import { PROBLEM_BASE } from '@majlis/contracts';

/** Services throw these; only the global filter maps them to HTTP. */
export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly type: string;
  abstract readonly title: string;

  constructor(detail: string) {
    super(detail);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends DomainError {
  readonly status = 401;
  readonly type = `${PROBLEM_BASE}/unauthorized`;
  readonly title = 'Unauthorized';
}

export class NotFoundError extends DomainError {
  readonly status = 404;
  readonly type = `${PROBLEM_BASE}/not-found`;
  readonly title = 'Not found';
}

export class ForbiddenError extends DomainError {
  readonly status = 403;
  readonly type = `${PROBLEM_BASE}/forbidden`;
  readonly title = 'Forbidden';
}

export class ConflictError extends DomainError {
  readonly status = 409;
  readonly type = `${PROBLEM_BASE}/conflict`;
  readonly title = 'Conflict';
}

export class UnprocessableError extends DomainError {
  readonly status = 422;
  readonly type = `${PROBLEM_BASE}/unprocessable`;
  readonly title = 'Unprocessable';
}
