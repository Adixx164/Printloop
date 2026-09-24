import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

export enum TenantMemberRole {
  /** Can manage billing, delete the tenant, add other owners. */
  OWNER = 'owner',
  /** Can manage kiosks, pricing, settings, customers. */
  ADMIN = 'admin',
  /** Can view jobs + process refunds; cannot change billing/branding. */
  STAFF = 'staff',
}

/**
 * Links a User to a Tenant with a role. One User can be a member of
 * multiple tenants (e.g. a regional admin overseeing several print
 * shops); a Tenant has many Members. Customers are NOT TenantMembers
 * — they're plain Users tagged with a tenantId on their row.
 *
 * Platform-level admins (PrintLoop's own staff) have no TenantMember
 * row; their permission comes from the User.role enum.
 */
@Entity('tenant_members')
@Index('idx_tenant_member_unique', ['tenantId', 'userId'], { unique: true })
@Index('idx_tenant_member_user', ['userId'])
export class TenantMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'simple-enum',
    enum: TenantMemberRole,
    default: TenantMemberRole.STAFF,
  })
  role: TenantMemberRole;

  @CreateDateColumn()
  createdAt: Date;
}
