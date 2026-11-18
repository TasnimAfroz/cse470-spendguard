import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit/audit-log.entity';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { CardTransaction } from './authorization/card-transaction.entity';
import { CardRuleHistory, CardStatusHistory } from './cards/card-history.entities';
import { CardsModule } from './cards/cards.module';
import { VirtualCard } from './cards/virtual-card.entity';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { SnakeNamingStrategy } from './common/snake-naming.strategy';
import { Department } from './departments/department.entity';
import { DepartmentsModule } from './departments/departments.module';
import { Tenant } from './tenants/tenant.entity';
import { TenantsModule } from './tenants/tenants.module';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';
import { LedgerEntry } from './wallets/ledger-entry.entity';
import { Wallet } from './wallets/wallet.entity';
import { WalletsModule } from './wallets/wallets.module';

export const ENTITIES = [Tenant, User, Department, Wallet, LedgerEntry, VirtualCard, CardRuleHistory, CardStatusHistory, CardTransaction, AuditLog];

/**
 * Root module. Each feature is its own NestJS module containing its
 * Model (entity + service), Controller and DTOs. The View is the React app in /frontend.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('DB_HOST', 'localhost'),
        port: Number(cfg.get('DB_PORT', 5432)),
        username: cfg.get('DB_USER', 'postgres'),
        password: cfg.get('DB_PASSWORD', 'postgres'),
        database: cfg.get('DB_NAME', 'virtual_card_db'),
        entities: ENTITIES,
        namingStrategy: new SnakeNamingStrategy(),
        // Development convenience: create/update tables from the entities on start.
        // The same schema is also provided as database/schema.sql.
        synchronize: cfg.get('DB_SYNC', 'true') === 'true',
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '8h') },
      }),
    }),
    AuditModule,
    AuthModule,
    TenantsModule,
    DepartmentsModule,
    UsersModule,
    WalletsModule,
    CardsModule,
    AuthorizationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // 1st: who are you?
    { provide: APP_GUARD, useClass: RolesGuard }, // 2nd: are you allowed?
  ],
})
export class AppModule {}
