import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
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
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
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
