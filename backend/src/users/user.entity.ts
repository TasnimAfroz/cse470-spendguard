import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../common/enums';
import { Department } from '../departments/department.entity';
import { Tenant } from '../tenants/tenant.entity';

/** MODEL – an employee of a tenant (F3). */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  @Column({ default: true })
  isActive: boolean;

  /** True after an admin creates the account with a temporary password. */
  @Column({ default: false })
  mustChangePassword: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
