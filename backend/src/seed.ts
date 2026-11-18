/**
 * Demo data for the Sprint 2 presentation:  npm run seed
 * Uses the real services (same business rules as the API), not raw SQL inserts.
 * Writes all logins and card numbers/CVVs to seed-output.txt (git-ignored).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { writeFileSync } from 'fs';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { AuthorizationService } from './authorization/authorization.service';
import { CardsService } from './cards/cards.service';
import { AuthUser } from './common/auth.decorators';
import { CardType, MerchantCategory, Role } from './common/enums';
import { DepartmentsService } from './departments/departments.service';
import { TenantsService } from './tenants/tenants.service';
import { User } from './users/user.entity';
import { UsersService } from './users/users.service';
import { WalletsService } from './wallets/wallets.service';

const COMPANY = 'Acme Tech Ltd';
const PASSWORD = 'Password@123';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const [exists] = await ds.query('SELECT 1 FROM tenants WHERE name = $1', [COMPANY]);
  if (exists) {
    console.log(`"${COMPANY}" already exists. To start fresh run:  npm run db:reset  then  npm run seed`);
    await app.close();
    return;
  }

  const tenants = app.get(TenantsService);
  const departments = app.get(DepartmentsService);
  const users = app.get(UsersService);
  const wallets = app.get(WalletsService);
  const cards = app.get(CardsService);
  const authz = app.get(AuthorizationService);

  // F1 – company + admin + treasury
  const reg = await tenants.register({ companyName: COMPANY, adminName: 'Ayesha Rahman', adminEmail: 'admin@acme.test', adminPassword: PASSWORD, baseCurrency: 'BDT', timezone: 'Asia/Dhaka' });
  const admin: AuthUser = { userId: reg.user.id, tenantId: reg.company.id, role: Role.FINANCE_ADMIN, departmentId: null, name: reg.user.name };

  // F2 – departments
  const eng = await departments.create(admin, { name: 'Engineering', code: 'ENG' });
  const mkt = await departments.create(admin, { name: 'Marketing', code: 'MKT' });
  const ops = await departments.create(admin, { name: 'Operations', code: 'OPS' });

  // F3 – people (password set to a known value for the demo)
  const mk = async (name: string, email: string, role: Role, departmentId?: string) => {
    const r = await users.create(admin, { name, email, role, departmentId });
    await ds.getRepository(User).update(r.user.id, { passwordHash: await bcrypt.hash(PASSWORD, 10), mustChangePassword: false });
    return r.user;
  };
  const finance = await mk('Farhan Ahmed', 'finance@acme.test', Role.FINANCE_MANAGER);
  const engMgr = await mk('Nusrat Jahan', 'eng.manager@acme.test', Role.DEPARTMENT_MANAGER);
  const mktMgr = await mk('Tanvir Hossain', 'mkt.manager@acme.test', Role.DEPARTMENT_MANAGER);
  await departments.assignManager(admin, eng.id, engMgr.id);
  await departments.assignManager(admin, mkt.id, mktMgr.id);
  const dev = await mk('Rafi Islam', 'dev@acme.test', Role.EMPLOYEE, eng.id);
  const designer = await mk('Sadia Karim', 'designer@acme.test', Role.EMPLOYEE, eng.id);
  const marketer = await mk('Imran Chowdhury', 'marketer@acme.test', Role.EMPLOYEE, mkt.id);
  await mk('Lamia Sultana', 'ops@acme.test', Role.EMPLOYEE, ops.id);

  // F4 – money
  await wallets.deposit(admin, { amount: 500000, reference: 'BRAC-BANK-TT-2026-11' });
  await wallets.allocate(admin, { departmentId: eng.id, amount: 150000, note: 'November engineering budget' });
  await wallets.allocate(admin, { departmentId: mkt.id, amount: 100000, note: 'November campaign budget' });
  await wallets.allocate(admin, { departmentId: ops.id, amount: 50000, note: 'November operations budget' });

  // F5 + F6 – cards
  const c1 = await cards.issue(admin, {
    type: CardType.STANDARD, holderId: dev.id, nickname: 'Cloud & dev tools',
    rules: { perTransactionLimit: 20000, dailyLimit: 30000, monthlyLimit: 60000, allowedCategories: [MerchantCategory.SAAS, MerchantCategory.CLOUD] },
  });
  const c2 = await cards.issue(admin, { type: CardType.SUBSCRIPTION, holderId: designer.id, nickname: 'Figma subscription', amount: 1500, merchantName: 'Figma' });
  const c3 = await cards.issue(admin, {
    type: CardType.STANDARD, holderId: marketer.id, nickname: 'Social ads',
    rules: { perTransactionLimit: 10000, monthlyLimit: 30000, allowedCategories: [MerchantCategory.ADVERTISING], allowedMerchants: ['Meta Ads', 'Google Ads'], allowedDays: [1, 2, 3, 4, 5, 7], allowedHours: { start: 9, end: 20 } },
  });
  const c4 = await cards.issue(admin, { type: CardType.SINGLE_USE, holderId: dev.id, nickname: 'Conference hotel', amount: 12000 });

  // F8 – a few transactions so the screens are not empty
  const charge = (s: { pan: string; cvv: string; expiryMonth: number; expiryYear: number }, merchantName: string, merchantCategory: MerchantCategory, amount: number, simulatedAt?: string) =>
    authz.charge(admin, { cardNumber: s.pan, cvv: s.cvv, expiryMonth: s.expiryMonth, expiryYear: s.expiryYear, merchantName, merchantCategory, amount, simulatedAt });
  await charge(c1.secrets, 'AWS', MerchantCategory.CLOUD, 12500);
  await charge(c1.secrets, 'GitHub', MerchantCategory.SAAS, 2100);
  await charge(c1.secrets, 'Daraz', MerchantCategory.ELECTRONICS, 45000); // declined: category
  await charge(c2.secrets, 'Figma', MerchantCategory.SAAS, 1500);
  await charge(c2.secrets, 'Figma', MerchantCategory.SAAS, 3000); // declined: price hike
  await charge(c3.secrets, 'Meta Ads', MerchantCategory.ADVERTISING, 8000, '2026-11-17T05:00:00Z');
  await charge(c3.secrets, 'Meta Ads', MerchantCategory.ADVERTISING, 4000, '2026-11-14T18:30:00Z'); // declined: Saturday night

  const fmtCard = (label: string, holder: string, s: { pan: string; cvv: string; expiryMonth: number; expiryYear: number }) =>
    `${label.padEnd(22)} ${holder.padEnd(20)} ${s.pan}  ${String(s.expiryMonth).padStart(2, '0')}/${s.expiryYear}  CVV ${s.cvv}`;
  const out = [
    `Demo company: ${COMPANY}   (all passwords: ${PASSWORD})`,
    '',
    'LOGINS',
    '  admin@acme.test        Finance Admin',
    '  finance@acme.test      Finance Manager',
    '  eng.manager@acme.test  Department Manager – Engineering',
    '  mkt.manager@acme.test  Department Manager – Marketing',
    '  dev@acme.test          Employee – Engineering',
    '  designer@acme.test     Employee – Engineering',
    '  marketer@acme.test     Employee – Marketing',
    '  ops@acme.test          Employee – Operations',
    '',
    'CARDS (CVV is shown only here and at issuance)',
    '  ' + fmtCard('Cloud & dev tools', 'Rafi Islam', c1.secrets),
    '  ' + fmtCard('Figma subscription', 'Sadia Karim', c2.secrets),
    '  ' + fmtCard('Social ads', 'Imran Chowdhury', c3.secrets),
    '  ' + fmtCard('Conference hotel', 'Rafi Islam', c4.secrets),
  ].join('\n');
  writeFileSync('seed-output.txt', out + '\n');
  console.log(out + '\n\nSaved to backend/seed-output.txt');
  void finance;
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
