import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PermissionsGuard } from './permissions.guard';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    // Guards run in registration order: SessionGuard sets req.actor, which PermissionsGuard reads.
    { provide: APP_GUARD, useClass: SessionGuard },
    // useExisting, so tests can `app.get(PermissionsGuard)` the same single instance.
    PermissionsGuard,
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
})
export class AuthModule {}
