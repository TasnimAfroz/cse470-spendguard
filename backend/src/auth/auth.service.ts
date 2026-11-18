import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

/** Supporting service (login is not a counted feature) – issues JWTs. */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async signToken(user: Pick<User, 'id' | 'tenantId' | 'role'>): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, tenantId: user.tenantId, role: user.role });
  }

  async login(email: string, password: string) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated');
    return { accessToken: await this.signToken(user), user: this.publicUser(user) };
  }

  async me(userId: string) {
    const user = await this.users.findOneOrFail({ where: { id: userId }, relations: { department: true } });
    return this.publicUser(user);
  }

  publicUser(u: User) {
    return {
      id: u.id,
      tenantId: u.tenantId,
      name: u.name,
      email: u.email,
      role: u.role,
      departmentId: u.departmentId,
      departmentName: u.department?.name ?? null,
      mustChangePassword: u.mustChangePassword,
    };
  }
}
