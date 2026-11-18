import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { Role } from './enums';

/**
 * Global guard #1 – authentication.
 * Verifies the Bearer token, then re-loads the user so that a deactivated
 * user (F3) or a changed role takes effect immediately, not when the token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) throw new UnauthorizedException('Missing access token');

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const rows = await this.dataSource.query(
      'SELECT id, tenant_id, role, department_id, name, is_active FROM users WHERE id = $1',
      [payload.sub],
    );
    const row = rows[0];
    if (!row || !row.is_active) throw new UnauthorizedException('Account is inactive');

    const user: AuthUser = {
      userId: row.id,
      tenantId: row.tenant_id,
      role: row.role,
      departmentId: row.department_id,
      name: row.name,
    };
    request.user = user;
    return true;
  }
}

/** Global guard #2 – authorization (RBAC). Runs after JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) return true; // public route
    if (!required.includes(user.role)) {
      throw new ForbiddenException(`This action requires one of: ${required.join(', ')}`);
    }
    return true;
  }
}
