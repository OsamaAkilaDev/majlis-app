import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { EmailChannel } from './email.channel';
import { NOTIFICATION_CHANNEL, type NotificationChannel } from './notification-channel';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    {
      provide: NOTIFICATION_CHANNEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): NotificationChannel =>
        new EmailChannel(config.get('PUBLIC_WEB_ORIGIN', { infer: true }).replace(/\/+$/, '')),
    },
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
