import { Controller, Get, Param } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { auditListSchema, type AuditList } from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import { AuditReadService } from './audit-read.service';

class AuditListDto extends createZodDto(auditListSchema) {}

@Controller()
export class AuditController {
  constructor(private readonly audit: AuditReadService) {}

  @Get('audit')
  @ZodResponse({ status: 200, type: AuditListDto })
  @RequirePermission('audit:read')
  list(): Promise<AuditList> {
    return this.audit.list();
  }

  @Get('clubs/:clubId/audit')
  @ZodResponse({ status: 200, type: AuditListDto })
  @RequirePermission('audit:read', { scope: 'club', from: 'params.clubId' })
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  forClub(@Param('clubId') clubId: string): Promise<AuditList> {
    return this.audit.forClub(clubId);
  }
}
