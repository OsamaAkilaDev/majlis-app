import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

interface Ambient {
  tx: Prisma.TransactionClient;
  afterCommit: (() => void)[];
}

/** Ambient transaction, so the audit writer joins the caller's transaction without being handed one. */
@Injectable()
export class TransactionHost {
  private readonly storage = new AsyncLocalStorage<Ambient>();

  constructor(private readonly prisma: PrismaService) {}

  get tx(): Prisma.TransactionClient {
    return this.storage.getStore()?.tx ?? this.prisma;
  }

  /** Joins an open transaction rather than a savepoint, so an inner failure cannot be swallowed. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return fn();

    const afterCommit: (() => void)[] = [];
    const result = await this.prisma.$transaction((tx) => this.storage.run({ tx, afterCommit }, fn));
    for (const hook of afterCommit) hook();
    return result;
  }

  /** Runs `hook` once the outermost transaction commits, never on rollback; at once with none open. */
  afterCommit(hook: () => void): void {
    const ambient = this.storage.getStore();
    if (ambient) ambient.afterCommit.push(hook);
    else hook();
  }
}
