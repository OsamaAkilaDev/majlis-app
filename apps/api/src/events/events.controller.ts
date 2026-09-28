import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  assignResponsibilityBodySchema,
  assignmentListSchema,
  assignmentSchema,
  cancelEventBodySchema,
  createEventBodySchema,
  eventDetailSchema,
  eventListQuerySchema,
  eventListSchema,
  newEventUploadSchema,
  patchEventBodySchema,
  publishEventBodySchema,
  removeAssignmentBodySchema,
  signedUploadSchema,
  type Assignment,
  type AssignmentList,
  type EventDetail,
  type EventList,
  type NewEventUpload,
  type SignedUpload,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Actor } from '../auth/actor.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { AssignmentsService } from './assignments.service';
import { EventsService } from './events.service';

class CreateEventDto extends createZodDto(createEventBodySchema) {}
class PatchEventDto extends createZodDto(patchEventBodySchema) {}
class CancelEventDto extends createZodDto(cancelEventBodySchema) {}
class AssignResponsibilityDto extends createZodDto(assignResponsibilityBodySchema) {}
class EventListQueryDto extends createZodDto(eventListQuerySchema) {}
class PublishEventDto extends createZodDto(publishEventBodySchema) {}
class RemoveAssignmentDto extends createZodDto(removeAssignmentBodySchema) {}
class EventDetailDto extends createZodDto(eventDetailSchema) {}
class EventListDto extends createZodDto(eventListSchema) {}
class NewEventUploadDto extends createZodDto(newEventUploadSchema) {}
class SignedUploadDto extends createZodDto(signedUploadSchema) {}
class AssignmentDto extends createZodDto(assignmentSchema) {}
class AssignmentListDto extends createZodDto(assignmentListSchema) {}

const NO_EVENT = { status: 404, description: 'No such event.', type: ProblemDetailsDto };

// Param names must match the decorator's `from` path, or no scope resolves and a real Lead is denied.
@Controller()
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly assignments: AssignmentsService,
  ) {}

  // Club-scoped, or no club role resolves and a Lead is denied their own upload.
  @Post('clubs/:clubId/uploads/event-poster')
  @ZodResponse({ status: 201, type: NewEventUploadDto })
  @RequirePermission('event:create', { scope: 'club', from: 'params.clubId' })
  mintPosterUpload(): Promise<NewEventUpload> {
    return this.events.mintPosterUpload();
  }

  @Post('clubs/:clubId/events')
  @ZodResponse({ status: 201, type: EventDetailDto })
  @RequirePermission('event:create', { scope: 'club', from: 'params.clubId' })
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'That club already has an event with that slug.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'That club is not accepting new activity, or the windows are inconsistent.', type: ProblemDetailsDto })
  create(
    @Actor() actor: User,
    @Param('clubId') clubId: string,
    @Body() body: CreateEventDto,
  ): Promise<EventDetail> {
    return this.events.create(actor, clubId, body);
  }

  @Get('events')
  @ZodResponse({ status: 200, type: EventListDto })
  list(@Actor() actor: User, @Query() query: EventListQueryDto): Promise<EventList> {
    return this.events.list(actor, query);
  }

  @Get('events/:eventId')
  @ZodResponse({ status: 200, type: EventDetailDto })
  @ApiResponse(NO_EVENT)
  detail(@Actor() actor: User, @Param('eventId') eventId: string): Promise<EventDetail> {
    return this.events.detail(actor, eventId);
  }

  @Patch('events/:eventId')
  @ZodResponse({ status: 200, type: EventDetailDto })
  @RequirePermission('event:edit', { scope: 'event', from: 'params.eventId' })
  @ApiResponse(NO_EVENT)
  @ApiResponse({ status: 422, description: 'The event is final, the windows are inconsistent, or capacity is below the confirmed count.', type: ProblemDetailsDto })
  update(
    @Actor() actor: User,
    @Param('eventId') eventId: string,
    @Body() body: PatchEventDto,
  ): Promise<EventDetail> {
    return this.events.update(actor, eventId, body);
  }

  @Post('events/:eventId/poster-upload-url')
  @ZodResponse({ status: 201, type: SignedUploadDto })
  @RequirePermission('event:edit', { scope: 'event', from: 'params.eventId' })
  posterUploadUrl(@Actor() actor: User, @Param('eventId') eventId: string): Promise<SignedUpload> {
    return this.events.mintEditUpload(actor, eventId);
  }

  @Post('events/:eventId/publish')
  @ZodResponse({ status: 201, type: EventDetailDto })
  @RequirePermission('event:publish', { scope: 'event', from: 'params.eventId' })
  @ApiResponse(NO_EVENT)
  @ApiResponse({ status: 422, description: 'That club is not active, or the event cannot be published from its current state.', type: ProblemDetailsDto })
  publish(
    @Actor() actor: User,
    @Param('eventId') eventId: string,
    @Body() body: PublishEventDto,
  ): Promise<EventDetail> {
    return this.events.publish(actor, eventId, body);
  }

  @Post('events/:eventId/cancel')
  @ZodResponse({ status: 201, type: EventDetailDto })
  @RequirePermission('event:cancel', { scope: 'event', from: 'params.eventId' })
  @ApiResponse(NO_EVENT)
  @ApiResponse({ status: 422, description: 'That event cannot be cancelled from its current state.', type: ProblemDetailsDto })
  cancel(
    @Actor() actor: User,
    @Param('eventId') eventId: string,
    @Body() body: CancelEventDto,
  ): Promise<EventDetail> {
    return this.events.cancel(actor, eventId, body);
  }

  @Get('events/:eventId/assignments')
  @ZodResponse({ status: 200, type: AssignmentListDto })
  @RequirePermission('event:assign', { scope: 'event', from: 'params.eventId' })
  @ApiResponse(NO_EVENT)
  listAssignments(@Param('eventId') eventId: string): Promise<AssignmentList> {
    return this.assignments.list(eventId);
  }

  @Post('events/:eventId/assignments')
  @ZodResponse({ status: 201, type: AssignmentDto })
  @RequirePermission('event:assign', { scope: 'event', from: 'params.eventId' })
  @ApiResponse(NO_EVENT)
  @ApiResponse({ status: 409, description: 'That person already holds that responsibility.', type: ProblemDetailsDto })
  assign(
    @Actor() actor: User,
    @Param('eventId') eventId: string,
    @Body() body: AssignResponsibilityDto,
  ): Promise<Assignment> {
    return this.assignments.assign(actor, eventId, body);
  }

  // Nested under the event: a permission scoped to one event cannot authorise a bare row id.
  @Delete('events/:eventId/assignments/:assignmentId')
  @HttpCode(204)
  @RequirePermission('event:assign', { scope: 'event', from: 'params.eventId' })
  @ApiResponse({ status: 404, description: 'No such assignment on that event.', type: ProblemDetailsDto })
  removeAssignment(
    @Actor() actor: User,
    @Param('eventId') eventId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: RemoveAssignmentDto,
  ): Promise<void> {
    return this.assignments.remove(actor, eventId, assignmentId, body);
  }
}
