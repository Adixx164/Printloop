import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { Wallet } from './wallet.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

export enum AdminPrivilege {
  MANAGE_PRICING = 'manage_pricing',
  MANAGE_KIOSKS = 'manage_kiosks',
  MANAGE_USERS = 'manage_users',
  MANAGE_ADMINS = 'manage_admins',
  VIEW_LOGS = 'view_logs',
  VIEW_REPORTS = 'view_reports',
}

@Entity('users')
@Index('idx_user_tenant', ['tenantId'])
// Tenant-scoped uniqueness — see migration TightenTenantUniqueness.
// Two tenants can each have a customer with the same email.
@Index('UQ_users_email_tenant', ['email', 'tenantId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The tenant this user belongs to. Customers (role=USER) ALWAYS
   * have one. Tenant admins/staff hang off a tenant via the
   * `tenant_members` join table instead, and their User row's
   * tenantId is NULL. Platform-level users (PrintLoop's own staff)
   * also have NULL here — their permission comes from role +
   * adminPrivileges.
   *
   * Email uniqueness is being moved from globally-unique to
   * (email, tenantId)-unique as part of the multi-tenancy cutover
   * (separate migration). Until then, the global UNIQUE on email
   * remains and limits us to one customer account per email
   * across all tenants.
   */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  // Uniqueness is composite (email, tenantId) — see class-level
  // @Index above. Per-column `unique: true` was removed when the
  // SaaS migration tightened the constraint.
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 255 })
  salt: string;

  /**
   * Long random secret a user can hand to their laptop's CUPS queue so
   * `Print → PrintLoop` works without a JWT login flow. Issued on demand,
   * rotatable from the dashboard. Unique because it's the *only* credential
   * proving "this CUPS job is from this PrintLoop user" — collisions would
   * be impersonations.
   */
  @Column({ type: 'varchar', length: 96, nullable: true, unique: true })
  printToken: string | null;

  /**
   * TOTP (2FA) secret, Base32. NULL until the user starts 2FA setup.
   * `totpEnabled` only flips true after they prove a valid code, so a
   * half-finished setup never locks anyone out. See utils/totp.ts.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  totpSecret: string | null;

  /** True once 2FA is confirmed; login then requires a TOTP code. */
  @Column({ type: 'boolean', default: false })
  totpEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  verificationToken: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  resetToken: string;

  @OneToOne(() => Wallet, wallet => wallet.user)
  wallet: Wallet;

  @Column({
    type: 'simple-enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ type: 'simple-json', nullable: true })
  adminPrivileges: AdminPrivilege[];

  @Column({ type: 'boolean', default: false })
  isBlocked: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  blockReason: string;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
