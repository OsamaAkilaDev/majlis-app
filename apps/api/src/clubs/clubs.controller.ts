import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  clubDetailSchema,
  clubListQuerySchema,
  clubListSchema,
  createClubBodySchema,
  newClubUploadSchema,
  patchClubBodySchema,
  patchClubStatusBodySchema,
  signedUploadSchema,
  type ClubDetail,
  type ClubList,
  type NewClubUpload,
  type SignedUpload,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Actor } from '../auth/actor.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { ClubsService } from './clubs.service';

class CreateClubDto extends createZodDto(createClubBodySchema) {}
class PatchClubDto extends createZodDto(patchClubBodySchema) {}
class PatchClubStatusDto extends createZodDto(patchClubStatusBodySchema) {}
class ClubListQueryDto extends createZodDto(clubListQuerySchema) {}
class ClubDetailDto extends createZodDto(clubDetailSchema) {}
class ClubListDto extends createZodDto(clubListSchema) {}
class NewClubUploadDto extends createZodDto(newClubUploadSchema) {}
class SignedUploadDto extends createZodDto(signedUploadSchema) {}

@Controller()
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  @Post('uploads/club-logo')
  @ZodResponse({ status: 201, type: NewClubUploadDto })
  @RequirePermission('club:create')
  mintClubLogoUpload(): Promise<NewClubUpload> {
    return this.clubs.mintLogoUpload();
  }

  @Post('clubs')
  @ZodResponse({ status: 201, type: ClubDetailDto })
  @RequirePermission('club:create')
  @ApiResponse({ status: 409, description: 'A club with that name already exists.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'The uploaded logo failed verification.', type: ProblemDetailsDto })
  create(@Actor() actor: User, @Body() body: CreateClubDto): Promise<ClubDetail> {
    return this.clubs.create(actor, body);
  }

  @Get('clubs')
  @ZodResponse({ status: 200, type: ClubListDto })
  list(@Actor() actor: User, @Query() query: ClubListQueryDto): Promise<ClubList> {
    return this.clubs.list(actor, query);
  }

  // Two segments, so it cannot collide with `clubs/:clubId` in any order.
  @Get('clubs/by-slug/:slug')
  @ZodResponse({ status: 200, type: ClubDetailDto })
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  detailBySlug(@Actor() actor: User, @Param('slug') slug: string): Promise<ClubDetail> {
    return this.clubs.detailBySlug(actor, slug);
  }

  @Get('clubs/:clubId')
  @ZodResponse({ status: 200, type: ClubDetailDto })
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  detail(@Actor() actor: User, @Param('clubId') clubId: string): Promise<ClubDetail> {
    return this.clubs.detail(actor, clubId);
  }

  @Patch('clubs/:clubId')
  @ZodResponse({ status: 200, type: ClubDetailDto })
  @RequirePermission('club:edit', { scope: 'club', from: 'params.clubId' })
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'That club is archived, or the uploaded image failed verification.', type: ProblemDetailsDto })
  update(@Actor() actor: User, @Param('clubId') clubId: string, @Body() body: PatchClubDto): Promise<ClubDetail> {
    return this.clubs.update(actor, clubId, body);
  }

  @Patch('clubs/:clubId/status')
  @ZodResponse({ status: 200, type: ClubDetailDto })
  @RequirePermission('club:status')
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'That transition is not allowed.', type: ProblemDetailsDto })
  updateStatus(
    @Actor() actor: User,
    @Param('clubId') clubId: string,
    @Body() body: PatchClubStatusDto,
  ): Promise<ClubDetail> {
    return this.clubs.updateStatus(actor, clubId, body);
  }

  @Post('clubs/:clubId/logo-upload-url')
  @ZodResponse({ status: 201, type: SignedUploadDto })
  @RequirePermission('club:edit', { scope: 'club', from: 'params.clubId' })
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'That club is archived.', type: ProblemDetailsDto })
  logoUploadUrl(@Actor() actor: User, @Param('clubId') clubId: string): Promise<SignedUpload> {
    return this.clubs.mintClubImageUpload(actor, clubId, 'club-logo');
  }

  @Post('clubs/:clubId/banner-upload-url')
  @ZodResponse({ status: 201, type: SignedUploadDto })
  @RequirePermission('club:edit', { scope: 'club', from: 'params.clubId' })
  @ApiResponse({ status: 404, description: 'No such club.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'That club is archived.', type: ProblemDetailsDto })
  bannerUploadUrl(@Actor() actor: User, @Param('clubId') clubId: string): Promise<SignedUpload> {
    return this.clubs.mintClubImageUpload(actor, clubId, 'club-banner');
  }
}
