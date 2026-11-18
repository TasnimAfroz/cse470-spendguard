import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from './enums';

/** Shape of the logged-in user, decoded from the JWT by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  departmentId: string | null;
  name: string;
}

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as not needing a JWT (company registration, login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the listed roles. Routes without @Roles are open to any logged-in user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the logged-in user into a controller method: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
