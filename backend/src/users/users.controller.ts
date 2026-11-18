import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/auth.decorators';
import { Role } from '../common/enums';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

const MANAGERS = [Role.FINANCE_ADMIN, Role.FINANCE_MANAGER, Role.DEPARTMENT_MANAGER];

/** CONTROLLER – /api/users (F3). */
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles(...MANAGERS)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('departmentId') departmentId?: string,
    @Query('role') role?: Role,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.list(user, { departmentId, role, includeInactive: includeInactive === 'true' });
  }

  @Roles(...MANAGERS)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.service.create(user, dto);
  }

  @Post('me/password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.service.changeOwnPassword(user, dto);
  }

  @Roles(...MANAGERS)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(user, id, dto);
  }

  @Roles(...MANAGERS)
  @Post(':id/deactivate')
  deactivate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deactivate(user, id);
  }

  @Roles(...MANAGERS)
  @Post(':id/reactivate')
  reactivate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reactivate(user, id);
  }
}
