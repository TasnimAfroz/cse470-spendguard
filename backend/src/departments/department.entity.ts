import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { DepartmentStatus } from '../common/enums';

/** MODEL – a department inside a tenant (F2). Its money lives in a Wallet of type DEPARTMENT. */
@Entity('departments')
@Unique(['tenantId', 'code'])
export class Department {
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

  /** Short code, unique inside the company, e.g. ENG, MKT. */
  @Column({ length: 10 })
  code: string;

  @Column({ type: 'uuid', nullable: true })
  managerId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'manager_id' })
  manager?: User | null;

  @Column({ type: 'enum', enum: DepartmentStatus, default: DepartmentStatus.ACTIVE })
  status: DepartmentStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
