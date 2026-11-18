import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CardsService } from '../cards/cards.service';
import { AuthUser } from '../common/auth.decorators';
import { DepartmentStatus, Role, ROLE_RANK } from '../common/enums';
import { isFinance } from '../common/scope';
import { Department } from '../departments/department.entity';
import { User } from './user.entity';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from './users.dto';

/** F3 – Employee & Role Management (business logic). */
@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cards: CardsService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, filter: { departmentId?: string; role?: Role; includeInactive?: boolean }) {
    if (!isFinance(user) && user.role !== Role.DEPARTMENT_MANAGER) {
      throw new ForbiddenException('Employees cannot view the employee directory');
    }
    const qb = this.dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.department', 'd')
      .where('u.tenantId = :t', { t: user.tenantId })
      .orderBy('u.isActive', 'DESC')
      .addOrderBy('u.name', 'ASC');
    if (!isFinance(user)) qb.andWhere('u.departmentId = :own', { own: user.departmentId });
    if (filter.departmentId) qb.andWhere('u.departmentId = :d', { d: filter.departmentId });
    if (filter.role) qb.andWhere('u.role = :r', { r: filter.role });
    if (!filter.includeInactive) qb.andWhere('u.isActive = true');
    const users = await qb.getMany();
    return users.map((u) => ({ ...u, departmentName: u.department?.name ?? null, department: undefined }));
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    this.assertCanGrant(actor, dto.role);
    if (actor.role === Role.DEPARTMENT_MANAGER) {
      if (dto.role !== Role.EMPLOYEE) throw new ForbiddenException('Department managers can only add employees');
      if (dto.departmentId !== actor.departmentId) throw new ForbiddenException('You can only add employees to your own department');
    }

    return this.dataSource.transaction(async (m) => {
      const taken = await m.createQueryBuilder(User, 'u').where('LOWER(u.email) = LOWER(:e)', { e: dto.email }).getExists();
      if (taken) throw new ConflictException('This email is already used');
      if (dto.departmentId) await this.activeDepartment(m, actor, dto.departmentId);

      const tempPassword = this.generateTempPassword();
      const created = await m.save(
        m.create(User, {
          tenantId: actor.tenantId,
          name: dto.name.trim(),
          email: dto.email.toLowerCase(),
          role: dto.role,
          departmentId: dto.departmentId ?? null,
          passwordHash: await bcrypt.hash(tempPassword, 10),
          mustChangePassword: true,
        }),
      );
      await this.audit.log({ tenantId: actor.tenantId, actorId: actor.userId, action: 'USER_CREATED', entityType: 'User', entityId: created.id, details: { email: created.email, role: created.role } }, m);
      const { passwordHash: _omit, ...safe } = created;
      // The temporary password is returned ONCE so the admin can hand it over; it is never stored in plain text.
      return { user: safe, tempPassword };
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    return this.dataSource.transaction(async (m) => {
      const target = await this.findInScope(m, actor, id);
      this.assertCanManage(actor, target);

      if (dto.role && dto.role !== target.role) {
        if (!isFinance(actor)) throw new ForbiddenException('Only finance can change roles');
        if (target.id === actor.userId) throw new BadRequestException('You cannot change your own role');
        this.assertCanGrant(actor, dto.role);
        if (target.role === Role.FINANCE_ADMIN) await this.assertNotLastAdmin(m, target);
        if (target.role === Role.DEPARTMENT_MANAGER) await this.clearManagedDepartment(m, target);
        target.role = dto.role;
      }

      if (dto.departmentId !== undefined && dto.departmentId !== target.departmentId) {
        if (!isFinance(actor)) throw new ForbiddenException('Only finance can move people between departments');
        await this.activeDepartment(m, actor, dto.departmentId);
        const managed = await m.findOneBy(Department, { managerId: target.id, status: DepartmentStatus.ACTIVE });
        if (managed) throw new BadRequestException(`${target.name} manages ${managed.name}; assign a new manager there first`);
        const liveCards = await this.cards.countLiveCardsOfHolder(m, target.id);
        if (liveCards > 0) {
          throw new BadRequestException(`${target.name} holds ${liveCards} active/frozen card(s) on the old department; terminate them first`);
        }
        target.departmentId = dto.departmentId;
      }

      if (dto.name) target.name = dto.name.trim();
      await m.save(target);
      await this.audit.log({ tenantId: actor.tenantId, actorId: actor.userId, action: 'USER_UPDATED', entityType: 'User', entityId: id, details: { ...dto } }, m);
      return target;
    });
  }

  /** Deactivation removes access immediately AND freezes every card the person holds. */
  async deactivate(actor: AuthUser, id: string) {
    return this.dataSource.transaction(async (m) => {
      const target = await this.findInScope(m, actor, id);
      if (target.id === actor.userId) throw new BadRequestException('You cannot deactivate yourself');
      this.assertCanManage(actor, target);
      if (!target.isActive) throw new BadRequestException('User is already inactive');
      if (target.role === Role.FINANCE_ADMIN) await this.assertNotLastAdmin(m, target);

      target.isActive = false;
      await m.save(target);
      if (target.role === Role.DEPARTMENT_MANAGER) await this.clearManagedDepartment(m, target);
      const frozen = await this.cards.freezeAllCardsOfHolder(m, actor, target.id, `Holder ${target.name} was deactivated`);
      await this.audit.log({ tenantId: actor.tenantId, actorId: actor.userId, action: 'USER_DEACTIVATED', entityType: 'User', entityId: id, details: { frozenCards: frozen } }, m);
      return { user: target, frozenCards: frozen };
    });
  }

  /** Cards stay frozen after reactivation – a manager must unfreeze them deliberately (F7). */
  async reactivate(actor: AuthUser, id: string) {
    return this.dataSource.transaction(async (m) => {
      const target = await this.findInScope(m, actor, id);
      this.assertCanManage(actor, target);
      if (target.isActive) throw new BadRequestException('User is already active');
      target.isActive = true;
      await m.save(target);
      await this.audit.log({ tenantId: actor.tenantId, actorId: actor.userId, action: 'USER_REACTIVATED', entityType: 'User', entityId: id }, m);
      return target;
    });
  }

  async changeOwnPassword(actor: AuthUser, dto: ChangePasswordDto) {
    const repo = this.dataSource.getRepository(User);
    const me = await repo.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id: actor.userId }).getOneOrFail();
    if (!(await bcrypt.compare(dto.currentPassword, me.passwordHash))) throw new UnauthorizedException('Current password is wrong');
    await repo.update(me.id, { passwordHash: await bcrypt.hash(dto.newPassword, 10), mustChangePassword: false });
    await this.audit.log({ tenantId: actor.tenantId, actorId: actor.userId, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: me.id });
    return { ok: true };
  }

  // ---------- business-rule helpers ----------

  /** Nobody can grant a role ranked above their own. */
  private assertCanGrant(actor: AuthUser, role: Role) {
    if (ROLE_RANK[role] > ROLE_RANK[actor.role]) throw new ForbiddenException(`You cannot grant the ${role} role`);
  }

  /** You can only manage people ranked at or below you; managers only their own department's employees. */
  private assertCanManage(actor: AuthUser, target: User) {
    if (ROLE_RANK[target.role] > ROLE_RANK[actor.role]) throw new ForbiddenException('You cannot modify a user with a higher role');
    if (actor.role === Role.DEPARTMENT_MANAGER && (target.role !== Role.EMPLOYEE || target.departmentId !== actor.departmentId)) {
      throw new ForbiddenException('Department managers can only manage employees in their own department');
    }
    if (actor.role === Role.EMPLOYEE) throw new ForbiddenException('Employees cannot manage users');
  }

  private async assertNotLastAdmin(m: EntityManager, target: User) {
    const admins = await m.count(User, { where: { tenantId: target.tenantId, role: Role.FINANCE_ADMIN, isActive: true } });
    if (admins <= 1) throw new BadRequestException('The company must keep at least one active Finance Admin');
  }

  private async clearManagedDepartment(m: EntityManager, target: User) {
    await m.update(Department, { managerId: target.id }, { managerId: null });
  }

  private async findInScope(m: EntityManager, actor: AuthUser, id: string): Promise<User> {
    const u = await m.findOneBy(User, { id, tenantId: actor.tenantId });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  private async activeDepartment(m: EntityManager, actor: AuthUser, departmentId: string) {
    const dept = await m.findOneBy(Department, { id: departmentId, tenantId: actor.tenantId });
    if (!dept) throw new NotFoundException('Department not found');
    if (dept.status !== DepartmentStatus.ACTIVE) throw new BadRequestException('Department is archived');
    return dept;
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join('');
  }
}
