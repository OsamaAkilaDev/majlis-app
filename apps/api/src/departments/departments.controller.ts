import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  createDepartmentBodySchema,
  departmentListSchema,
  departmentSchema,
  patchDepartmentBodySchema,
  type Department,
  type DepartmentList,
} from '@majlis/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { Actor } from '../auth/actor.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { DepartmentsService } from './departments.service';

class CreateDepartmentDto extends createZodDto(createDepartmentBodySchema) {}
class PatchDepartmentDto extends createZodDto(patchDepartmentBodySchema) {}
class DepartmentDto extends createZodDto(departmentSchema) {}
class DepartmentListDto extends createZodDto(departmentListSchema) {}

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @ZodResponse({ status: 200, type: DepartmentListDto })
  @ApiResponse({ status: 401, description: 'Not signed in.', type: ProblemDetailsDto })
  list(): Promise<DepartmentList> {
    return this.departments.list();
  }

  @Post()
  @ZodResponse({ status: 201, type: DepartmentDto })
  @RequirePermission('department:manage')
  @ApiResponse({ status: 409, description: 'A department with that name or code already exists.', type: ProblemDetailsDto })
  create(@Actor() actor: User, @Body() body: CreateDepartmentDto): Promise<Department> {
    return this.departments.create(actor, body);
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: DepartmentDto })
  @RequirePermission('department:manage')
  @ApiResponse({ status: 404, description: 'No such department.', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'A department with that name or code already exists.', type: ProblemDetailsDto })
  update(@Actor() actor: User, @Param('id') id: string, @Body() body: PatchDepartmentDto): Promise<Department> {
    return this.departments.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('department:manage')
  @ApiResponse({ status: 404, description: 'No such department.', type: ProblemDetailsDto })
  @ApiResponse({ status: 409, description: 'That department still has clubs.', type: ProblemDetailsDto })
  remove(@Actor() actor: User, @Param('id') id: string): Promise<void> {
    return this.departments.remove(actor, id);
  }
}
