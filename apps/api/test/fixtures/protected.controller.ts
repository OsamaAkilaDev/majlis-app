import { Controller, Get, Module } from '@nestjs/common';
import { Actor } from '../../src/auth/actor.decorator';
import type { User } from '../../src/generated/prisma/client';

/** Test modules only, never AppModule; SessionGuard applies globally. */
@Controller('__test')
export class ProtectedController {
  @Get('protected')
  get(@Actor() actor: User): { id: string } {
    return { id: actor.id };
  }
}

@Module({ controllers: [ProtectedController] })
export class ProtectedTestModule {}
