import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../common/auth.decorators';
import { Role, WalletType } from '../common/enums';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { Tenant } from './tenant.entity';
import { RegisterCompanyDto, UpdateCompanyDto } from './tenants.dto';

/** F1 – Company Onboarding & Tenant Isolation (business logic). */
@Injectable()
export class TenantsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /** Creates tenant + Finance Admin + Treasury wallet in ONE transaction: all or nothing. */
  async register(dto: RegisterCompanyDto) {
    const result = await this.dataSource.transaction(async (m) => {
      if (await m.exists(Tenant, { where: { name: dto.companyName.trim() } })) {
        throw new ConflictException('A company with this name is already registered');
      }
      const emailTaken = await m
        .createQueryBuilder(User, 'u')
        .where('LOWER(u.email) = LOWER(:e)', { e: dto.adminEmail })
        .getExists();
      if (emailTaken) throw new ConflictException('This email is already used');

      const tenant = await m.save(
        m.create(Tenant, {
          name: dto.companyName.trim(),
          baseCurrency: dto.baseCurrency ?? 'BDT',
          timezone: dto.timezone ?? 'Asia/Dhaka',
        }),
      );
      const admin = await m.save(
        m.create(User, {
          tenantId: tenant.id,
          name: dto.adminName.trim(),
          email: dto.adminEmail.toLowerCase(),
          passwordHash: await bcrypt.hash(dto.adminPassword, 10),
          role: Role.FINANCE_ADMIN,
          departmentId: null,
        }),
      );
      await m.save(m.create(Wallet, { tenantId: tenant.id, type: WalletType.TREASURY, currency: tenant.baseCurrency, balance: 0 }));
      await this.audit.log(
        { tenantId: tenant.id, actorId: admin.id, action: 'COMPANY_REGISTERED', entityType: 'Tenant', entityId: tenant.id, details: { name: tenant.name } },
        m,
      );
      return { tenant, admin };
    });

    return {
      accessToken: await this.auth.signToken(result.admin),
      company: result.tenant,
      user: this.auth.publicUser(result.admin),
    };
  }

  getProfile(user: AuthUser) {
    // Tenant id ALWAYS comes from the token, never from the request body or URL.
    return this.tenants.findOneByOrFail({ id: user.tenantId });
  }

  async updateProfile(user: AuthUser, dto: UpdateCompanyDto) {
    const tenant = await this.tenants.findOneByOrFail({ id: user.tenantId });
    if (dto.name && dto.name.trim() !== tenant.name) {
      if (await this.tenants.exists({ where: { name: dto.name.trim() } })) {
        throw new ConflictException('A company with this name is already registered');
      }
      tenant.name = dto.name.trim();
    }
    if (dto.timezone) tenant.timezone = dto.timezone;
    await this.tenants.save(tenant);
    await this.audit.log({ tenantId: tenant.id, actorId: user.userId, action: 'COMPANY_UPDATED', entityType: 'Tenant', entityId: tenant.id, details: { ...dto } });
    return tenant;
  }
}
