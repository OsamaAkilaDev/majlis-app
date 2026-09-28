import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { Permission } from './permissions';

/** `from` is a dotted request path to the scope identifier only; authority is re-derived from the database. */
export interface ScopeSpec {
  scope: 'club' | 'event' | 'certificate';
  from: string;
}

export interface RequiredPermission {
  permission: Permission;
  scope?: ScopeSpec;
}

export const PERMISSION_KEY = 'requiredPermission';

/** Also documents the 403; its description must match what PermissionsGuard throws. */
export const RequirePermission = (permission: Permission, scope?: ScopeSpec) =>
  applyDecorators(
    SetMetadata(PERMISSION_KEY, { permission, scope } satisfies RequiredPermission),
    ApiResponse({
      status: 403,
      description: 'You do not have permission to do that.',
      type: ProblemDetailsDto,
    }),
  );
