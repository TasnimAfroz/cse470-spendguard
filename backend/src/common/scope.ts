import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './auth.decorators';
import { FINANCE_ROLES, Role } from './enums';

export const isFinance = (user: AuthUser) => FINANCE_ROLES.includes(user.role);

/**
 * Department-level data scoping used by several services:
 * finance roles see every department, everyone else only their own.
 */
export function assertDepartmentAccess(user: AuthUser, departmentId: string | null | undefined): void {
  if (isFinance(user)) return;
  if (!departmentId || user.departmentId !== departmentId) {
    throw new ForbiddenException('You can only act on your own department');
  }
}

export function assertManagerOrFinance(user: AuthUser): void {
  if (!isFinance(user) && user.role !== Role.DEPARTMENT_MANAGER) {
    throw new ForbiddenException('Only managers and finance can do this');
  }
}
