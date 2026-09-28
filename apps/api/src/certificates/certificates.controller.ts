import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  certificateIssueResultSchema,
  certificateListSchema,
  certificateSchema,
  revokeCertificateBodySchema,
  type Certificate,
  type CertificateIssueResult,
  type CertificateList,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Actor } from '../auth/actor.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { CertificatesService } from './certificates.service';

class RevokeCertificateDto extends createZodDto(revokeCertificateBodySchema) {}
class CertificateDto extends createZodDto(certificateSchema) {}
class CertificateListDto extends createZodDto(certificateListSchema) {}
class CertificateIssueResultDto extends createZodDto(certificateIssueResultSchema) {}

@Controller()
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Idempotent: a second press issues nothing and answers with the totals. */
  @Post('events/:eventId/certificates/issue')
  @ZodResponse({ status: 200, type: CertificateIssueResultDto })
  @RequirePermission('certificate:manage', { scope: 'event', from: 'params.eventId' })
  @ApiResponse({ status: 404, description: 'No such event.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'That event is not ready to issue certificates.', type: ProblemDetailsDto })
  issue(@Actor() actor: User, @Param('eventId') eventId: string): Promise<CertificateIssueResult> {
    return this.certificates.issue(actor, eventId);
  }

  @Get('events/:eventId/certificates')
  @ZodResponse({ status: 200, type: CertificateListDto })
  @RequirePermission('certificate:manage', { scope: 'event', from: 'params.eventId' })
  forEvent(@Param('eventId') eventId: string): Promise<CertificateList> {
    return this.certificates.forEvent(eventId);
  }

  @Get('me/certificates')
  @ZodResponse({ status: 200, type: CertificateListDto })
  mine(@Actor() actor: User): Promise<CertificateList> {
    return this.certificates.mine(actor);
  }

  @Post('certificates/:id/revoke')
  @ZodResponse({ status: 200, type: CertificateDto })
  @RequirePermission('certificate:manage', { scope: 'certificate', from: 'params.id' })
  @ApiResponse({ status: 404, description: 'No such certificate.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'That certificate is already revoked.', type: ProblemDetailsDto })
  revoke(
    @Actor() actor: User,
    @Param('id') id: string,
    @Body() body: RevokeCertificateDto,
  ): Promise<Certificate> {
    return this.certificates.revoke(actor, id, body);
  }
}
