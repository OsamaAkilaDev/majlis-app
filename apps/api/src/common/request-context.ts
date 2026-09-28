import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestFacts {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

/** Not REQUEST-scoped: request scope would propagate to every service that injects it. */
@Injectable()
export class RequestContext {
  private readonly storage = new AsyncLocalStorage<RequestFacts>();

  get current(): RequestFacts | undefined {
    return this.storage.getStore();
  }

  run<T>(facts: RequestFacts, fn: () => T): T {
    return this.storage.run(facts, fn);
  }
}
