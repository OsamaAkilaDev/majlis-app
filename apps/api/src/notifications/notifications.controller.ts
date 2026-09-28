import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  notificationListQuerySchema,
  notificationListSchema,
  notificationSchema,
  type Notification,
  type NotificationList,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Actor } from '../auth/actor.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { NotificationService } from './notification.service';

class NotificationListQueryDto extends createZodDto(notificationListQuerySchema) {}
class NotificationDto extends createZodDto(notificationSchema) {}
class NotificationListDto extends createZodDto(notificationListSchema) {}

// Self-scoped by `actor.id`; no permission key.
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ZodResponse({ status: 200, type: NotificationListDto })
  list(@Actor() actor: User, @Query() query: NotificationListQueryDto): Promise<NotificationList> {
    return this.notifications.list(actor, query);
  }

  @Post(':id/read')
  @ZodResponse({ status: 200, type: NotificationDto })
  @ApiResponse({ status: 404, description: 'No such notification.', type: ProblemDetailsDto })
  read(@Actor() actor: User, @Param('id') id: string): Promise<Notification> {
    return this.notifications.markRead(actor, id);
  }
}
