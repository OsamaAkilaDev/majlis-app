import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  myRegistrationListQuerySchema,
  myRegistrationListSchema,
  registerBodySchema,
  registrationListQuerySchema,
  registrationListSchema,
  registrationSchema,
  type MyRegistrationList,
  type Registration,
  type RegistrationList,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Actor } from '../auth/actor.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { RegistrationsService } from './registrations.service';

class RegisterDto extends createZodDto(registerBodySchema) {}
class RegistrationListQueryDto extends createZodDto(registrationListQuerySchema) {}
class MyRegistrationListQueryDto extends createZodDto(myRegistrationListQuerySchema) {}
class RegistrationDto extends createZodDto(registrationSchema) {}
class RegistrationListDto extends createZodDto(registrationListSchema) {}
class MyRegistrationListDto extends createZodDto(myRegistrationListSchema) {}

@Controller()
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  // Self-scoped. The service checks the Admin override against the real platform role.
  @Post('events/:eventId/registrations')
  @ZodResponse({ status: 201, type: RegistrationDto })
  @ApiResponse({ status: 403, description: 'Only an administrator may register someone else.', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'No such event.', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'That event is full and has no waitlist.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'Registration is not open, or you are not eligible.', type: ProblemDetailsDto })
  register(
    @Actor() actor: User,
    @Param('eventId') eventId: string,
    @Body() body: RegisterDto,
  ): Promise<Registration> {
    return this.registrations.register(actor, eventId, body);
  }

  @Delete('events/:eventId/registrations/me')
  @HttpCode(204)
  @ApiResponse({ status: 404, description: 'No such event, or you are not registered for it.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'That event no longer accepts registration changes.', type: ProblemDetailsDto })
  cancel(@Actor() actor: User, @Param('eventId') eventId: string): Promise<void> {
    return this.registrations.cancel(actor, eventId);
  }

  // Marketing is excluded from the roster by design.
  @Get('events/:eventId/registrations')
  @ZodResponse({ status: 200, type: RegistrationListDto })
  @RequirePermission('registration:read', { scope: 'event', from: 'params.eventId' })
  roster(
    @Param('eventId') eventId: string,
    @Query() query: RegistrationListQueryDto,
  ): Promise<RegistrationList> {
    return this.registrations.roster(eventId, query);
  }

  @Get('me/registrations')
  @ZodResponse({ status: 200, type: MyRegistrationListDto })
  mine(
    @Actor() actor: User,
    @Query() query: MyRegistrationListQueryDto,
  ): Promise<MyRegistrationList> {
    return this.registrations.mine(actor, query);
  }
}
