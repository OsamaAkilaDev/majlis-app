import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../config/env.schema';
import { pgAdapter } from './pg-adapter';

/** pgBouncer transaction mode still supports row locks, so FOR UPDATE works through the pooler. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: pgAdapter(config.get('DATABASE_URL', { infer: true })),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
