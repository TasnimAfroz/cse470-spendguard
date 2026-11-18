import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { assertDepartmentAccess } from '../common/scope';
import { AssignManagerDto, CreateDepartmentDto, UpdateDepartmentDto } from './departments.dto';
import { DepartmentsService } from './departments.service';

const FINANCE = [Role.FINANCE_ADMIN, Role.FINANCE_MANAGER];

/** CONTROLLER – /api/departments (F2). */
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('includeArchived') includeArchived?: string) {
    return this.service.list(user, includeArchived === 'true');
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    assertDepartmentAccess(user, id);
    return this.service.findOne(user, id);
  }

  @Roles(...FINANCE)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDepartmentDto) {
    return this.service.create(user, dto);
  }

  @Roles(...FINANCE)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(user, id, dto);
  }

  @Roles(...FINANCE)
  @Post(':id/manager')
  assignManager(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignManagerDto) {
    return this.service.assignManager(user, id, dto.managerId);
  }

  @Roles(...FINANCE)
  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(user, id);
  }
}
