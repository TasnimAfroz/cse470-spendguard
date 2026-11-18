import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth.decorators';
import { CardStatus, DepartmentStatus, Role, WalletType } from '../common/enums';
import { isFinance } from '../common/scope';
import { VirtualCard } from '../cards/virtual-card.entity';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { Department } from './department.entity';
import { CreateDepartmentDto, UpdateDepartmentDto } from './departments.dto';

/** F2 – Department Management (business logic). */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** List with member count, wallet balance and active cards. Non-finance users only see their own department. */
  async list(user: AuthUser, includeArchived = false) {
    const params: unknown[] = [user.tenantId];
    let where = 'd.tenant_id = $1';
    if (!includeArchived) where += ` AND d.status = 'ACTIVE'`;
    if (!isFinance(user)) {
      params.push(user.departmentId);
      where += ` AND d.id = $${params.length}`;
    }
    const rows = await this.dataSource.query(
      `SELECT d.id, d.name, d.code, d.status, d.manager_id AS "managerId", m.name AS "managerName",
              w.id AS "walletId", w.balance::float AS "walletBalance",
              (SELECT COUNT(*)::int FROM users u WHERE u.department_id = d.id AND u.is_active) AS "memberCount",
              (SELECT COUNT(*)::int FROM virtual_cards c WHERE c.department_id = d.id AND c.status IN ('ACTIVE','FROZEN')) AS "activeCardCount",
              d.created_at AS "createdAt"
         FROM departments d
         LEFT JOIN users m ON m.id = d.manager_id
         LEFT JOIN wallets w ON w.department_id = d.id
        WHERE ${where}
        ORDER BY d.status, d.name`,
      params,
    );
    return rows;
  }

  async findOne(user: AuthUser, id: string, m: EntityManager = this.dataSource.manager): Promise<Department> {
    const dept = await m.findOneBy(Department, { id, tenantId: user.tenantId });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(user: AuthUser, dto: CreateDepartmentDto) {
    return this.dataSource.transaction(async (m) => {
      const code = dto.code.toUpperCase();
      if (await m.exists(Department, { where: { tenantId: user.tenantId, code } })) {
        throw new ConflictException(`Department code ${code} already exists`);
      }
      const dept = await m.save(m.create(Department, { tenantId: user.tenantId, name: dto.name.trim(), code, managerId: null }));
      const tenantCurrency = (await m.query('SELECT base_currency FROM tenants WHERE id = $1', [user.tenantId]))[0].base_currency;
      // Every department gets its own sub-wallet, created together with it.
      await m.save(m.create(Wallet, { tenantId: user.tenantId, type: WalletType.DEPARTMENT, departmentId: dept.id, balance: 0, currency: tenantCurrency }));
      if (dto.managerId) await this.setManager(m, user, dept, dto.managerId);
      await this.audit.log({ tenantId: user.tenantId, actorId: user.userId, action: 'DEPARTMENT_CREATED', entityType: 'Department', entityId: dept.id, details: { name: dept.name, code } }, m);
      return dept;
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateDepartmentDto) {
    return this.dataSource.transaction(async (m) => {
      const dept = await this.findOne(user, id, m);
      this.assertActive(dept);
      if (dto.code && dto.code.toUpperCase() !== dept.code) {
        const code = dto.code.toUpperCase();
        if (await m.exists(Department, { where: { tenantId: user.tenantId, code, id: Not(id) } })) {
          throw new ConflictException(`Department code ${code} already exists`);
        }
        dept.code = code;
      }
      if (dto.name) dept.name = dto.name.trim();
      await m.save(dept);
      await this.audit.log({ tenantId: user.tenantId, actorId: user.userId, action: 'DEPARTMENT_UPDATED', entityType: 'Department', entityId: id, details: { ...dto } }, m);
      return dept;
    });
  }

  async assignManager(user: AuthUser, id: string, managerId: string) {
    return this.dataSource.transaction(async (m) => {
      const dept = await this.findOne(user, id, m);
      this.assertActive(dept);
      await this.setManager(m, user, dept, managerId);
      await this.audit.log({ tenantId: user.tenantId, actorId: user.userId, action: 'DEPARTMENT_MANAGER_ASSIGNED', entityType: 'Department', entityId: id, details: { managerId } }, m);
      return dept;
    });
  }

  /** Archive only when the wallet is empty and no card can still spend. */
  async archive(user: AuthUser, id: string) {
    return this.dataSource.transaction(async (m) => {
      const dept = await this.findOne(user, id, m);
      this.assertActive(dept);
      const wallet = await m.findOneByOrFail(Wallet, { departmentId: id });
      if (wallet.balance > 0) {
        throw new BadRequestException(`Reclaim the remaining ${wallet.balance.toFixed(2)} ${wallet.currency} to the treasury before archiving`);
      }
      const liveCards = await m.count(VirtualCard, { where: { departmentId: id, status: In([CardStatus.ACTIVE, CardStatus.FROZEN]) } });
      if (liveCards > 0) throw new BadRequestException(`Terminate the department's ${liveCards} active or frozen card(s) before archiving`);
      dept.status = DepartmentStatus.ARCHIVED;
      await m.save(dept);
      await this.audit.log({ tenantId: user.tenantId, actorId: user.userId, action: 'DEPARTMENT_ARCHIVED', entityType: 'Department', entityId: id }, m);
      return dept;
    });
  }

  private assertActive(dept: Department) {
    if (dept.status !== DepartmentStatus.ACTIVE) throw new BadRequestException('This department is archived');
  }

  /** Business rule: a manager must be an active DEPARTMENT_MANAGER of this tenant and manages one department only. */
  private async setManager(m: EntityManager, user: AuthUser, dept: Department, managerId: string) {
    const manager = await m.findOneBy(User, { id: managerId, tenantId: user.tenantId });
    if (!manager) throw new NotFoundException('Manager not found');
    if (!manager.isActive) throw new BadRequestException('This user is deactivated');
    if (manager.role !== Role.DEPARTMENT_MANAGER) {
      throw new BadRequestException('Only users with the DEPARTMENT_MANAGER role can manage a department');
    }
    const other = await m.findOne(Department, { where: { managerId, status: DepartmentStatus.ACTIVE, id: Not(dept.id) } });
    if (other) throw new ConflictException(`${manager.name} already manages ${other.name}`);
    dept.managerId = managerId;
    await m.save(dept);
    if (manager.departmentId !== dept.id) {
      manager.departmentId = dept.id; // a manager belongs to the department they manage
      await m.save(manager);
    }
  }
}
