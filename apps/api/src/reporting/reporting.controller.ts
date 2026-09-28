import { Controller, Get, Param } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  clubReportSchema,
  overviewReportSchema,
  type ClubReport,
  type OverviewReport,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import { ReportingService } from './reporting.service';

class OverviewReportDto extends createZodDto(overviewReportSchema) {}
class ClubReportDto extends createZodDto(clubReportSchema) {}

@Controller()
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  // Unscoped, so only the platform half of `report:read` satisfies it.
  @Get('reports/overview')
  @ZodResponse({ status: 200, type: OverviewReportDto })
  @RequirePermission('report:read')
  overview(): Promise<OverviewReport> {
    return this.reporting.overview();
  }

  @Get('clubs/:clubId/reports')
  @ZodResponse({ status: 200, type: ClubReportDto })
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  forClub(@Param('clubId') clubId: string): Promise<ClubReport> {
    return this.reporting.forClub(clubId);
  }
}
