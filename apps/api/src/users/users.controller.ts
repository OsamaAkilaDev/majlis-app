import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  patchMeBodySchema,
  patchUserBodySchema,
  patchUserStatusBodySchema,
  userListSchema,
  userListQuerySchema,
  userProfileSchema,
  userSearchQuerySchema,
  userSearchResultSchema,
  type Me,
  type UserList,
  type UserProfile,
  type UserSearchResult,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Actor } from '../auth/actor.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { UsersService } from './users.service';

class PatchMeDto extends createZodDto(patchMeBodySchema) {}
class PatchUserDto extends createZodDto(patchUserBodySchema) {}
class PatchUserStatusDto extends createZodDto(patchUserStatusBodySchema) {}
class UsersQueryDto extends createZodDto(userListQuerySchema) {}
class UserSearchQueryDto extends createZodDto(userSearchQuerySchema) {}
class UserProfileDto extends createZodDto(userProfileSchema) {}
class UserListDto extends createZodDto(userListSchema) {}
class UserSearchResultDto extends createZodDto(userSearchResultSchema) {}

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ZodResponse({ status: 200, type: UserProfileDto })
  @ApiResponse({ status: 401, description: 'Not signed in.', type: ProblemDetailsDto })
  me(@Actor() actor: User): Me {
    return this.users.me(actor);
  }

  @Patch('me')
  @ZodResponse({ status: 200, type: UserProfileDto })
  @ApiResponse({ status: 401, description: 'Not signed in.', type: ProblemDetailsDto })
  updateMe(@Actor() actor: User, @Body() body: PatchMeDto): Promise<Me> {
    return this.users.updateMe(actor, body);
  }

  @Get('users')
  @ZodResponse({ status: 200, type: UserListDto })
  list(@Query() query: UsersQueryDto): Promise<UserList> {
    return this.users.list(query);
  }

  // Under the club: `user:search` is club-scoped and needs a clubId to resolve roles.
  @Get('clubs/:clubId/user-search')
  @ZodResponse({ status: 200, type: UserSearchResultDto })
  @RequirePermission('user:search', { scope: 'club', from: 'params.clubId' })
  search(@Query() query: UserSearchQueryDto): Promise<UserSearchResult> {
    return this.users.search(query);
  }

  @Patch('users/:id')
  @ZodResponse({ status: 200, type: UserProfileDto })
  @RequirePermission('user:edit')
  @ApiResponse({ status: 404, description: 'No such user.', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'That email is already taken.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'Nothing to change, your own role, or the last admin.', type: ProblemDetailsDto })
  update(
    @Actor() actor: User,
    @Param('id') id: string,
    @Body() body: PatchUserDto,
  ): Promise<UserProfile> {
    return this.users.update(actor, id, body);
  }

  @Patch('users/:id/status')
  @ZodResponse({ status: 200, type: UserProfileDto })
  @RequirePermission('user:suspend')
  @ApiResponse({ status: 404, description: 'No such user.', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'That account is already in that state.', type: ProblemDetailsDto })
  @ApiResponse({ status: 422, description: 'You cannot change your own account status.', type: ProblemDetailsDto })
  updateStatus(
    @Actor() actor: User,
    @Param('id') id: string,
    @Body() body: PatchUserStatusDto,
  ): Promise<UserProfile> {
    return this.users.updateStatus(actor, id, body);
  }
}
