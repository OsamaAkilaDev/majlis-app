import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  attendanceListSchema,
  checkInResultSchema,
  correctAttendanceBodySchema,
  manualCheckInBodySchema,
  type AttendanceList,
  type CheckInResult,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Actor } from '../auth/actor.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { AttendanceService } from './attendance.service';

class ManualCheckInDto extends createZodDto(manualCheckInBodySchema) {}
class CorrectAttendanceDto extends createZodDto(correctAttendanceBodySchema) {}
// A union cannot be extended, so this DTO is a value, named for the document.
const CheckInResultDto = Object.defineProperty(createZodDto(checkInResultSchema), 'name', {
  value: 'CheckInResultDto',
});
class AttendanceListDto extends createZodDto(attendanceListSchema) {}

@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // 200 even for refusals: they are answers for the check-in screen, not client errors.
  @Post('events/:eventId/check-in/manual')
  @ZodResponse({ status: 200, type: CheckInResultDto })
  @RequirePermission('attendance:check-in', { scope: 'event', from: 'params.eventId' })
  @ApiResponse({ status: 404, description: 'No such event.', type: ProblemDetailsDto })
  manual(
    @Actor() actor: User,
    @Param('eventId') eventId: string,
    @Body() body: ManualCheckInDto,
  ): Promise<CheckInResult> {
    return this.attendance.manual(actor, eventId, body);
  }

  // Bulk personal data, so `registration:read`, not `attendance:check-in`.
  @Get('events/:eventId/attendance')
  @ZodResponse({ status: 200, type: AttendanceListDto })
  @RequirePermission('registration:read', { scope: 'event', from: 'params.eventId' })
  roster(@Param('eventId') eventId: string): Promise<AttendanceList> {
    return this.attendance.roster(eventId);
  }

  @Patch('events/:eventId/attendance/:registrationId')
  @HttpCode(204)
  @RequirePermission('attendance:correct', { scope: 'event', from: 'params.eventId' })
  @ApiResponse({ status: 404, description: 'No such registration for that event.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'The event has not started or was cancelled, or it is CERTIFIED and needs an Admin override reason.', type: ProblemDetailsDto })
  correct(
    @Actor() actor: User,
    @Param('eventId') eventId: string,
    @Param('registrationId') registrationId: string,
    @Body() body: CorrectAttendanceDto,
  ): Promise<void> {
    return this.attendance.correct(actor, eventId, registrationId, body);
  }
}
