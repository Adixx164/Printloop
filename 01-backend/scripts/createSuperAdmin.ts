/**
 * createSuperAdmin — production bootstrap CLI.
 *
 * Mints the first SUPER_ADMIN row directly against the configured
 * database (SQLite or Postgres — driver auto-selects from
 * DATABASE_URL exactly like the API does). Used to onboard the
 * platform operator on a fresh production DB where the demo seed
 * is OFF (SEED_DEMO !== "1") — otherwise there'd be no way to log
 * into the platform console at all.
 *
 * Usage
 * ─────
 *   tsx scripts/createSuperAdmin.ts <email> <password> \
 *       [--first-name=<First>] [--last-name=<Last>] \
 *       [--reset-password]
 *
 * Or via env (handy for Docker `docker compose run`):
 *   SUPER_ADMIN_EMAIL=ops@you.com \
 *   SUPER_ADMIN_PASSWORD='S3cret!' \
 *   tsx scripts/createSuperAdmin.ts
 *
 * Idempotency
 * ───────────
 *   - new email → inserts a new SUPER_ADMIN, links them as OWNER of
 *     the legacy tenant, exits 0.
 *   - existing email + already SUPER_ADMIN + no --reset-password →
 *     exits 0 with "already exists" (safe to re-run).
 *   - existing email + not SUPER_ADMIN + no --reset-password →
 *     exits non-zero (refuses to silently promote).
 *   - --reset-password → promotes role to SUPER_ADMIN and rotates
 *     the password.
 *
 * Why TS, not .cjs
 * ────────────────
 *   The script reuses the same AppDataSource + entities the API
 *   uses, so the schema/migration set stays single-source-of-truth.
 *   The backend runs via `tsx` everywhere (no build step) — the CLI
 *   follows the same pattern.
 */
import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database.js';
import { getOrCreateLegacyTenantId } from '../config/seed.js';
import { User, UserRole } from '../entities/user.entity.js';
import {
  TenantMember,
  TenantMemberRole,
} from '../entities/tenantMember.entity.js';

interface ParsedArgs {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  resetPassword: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) {
        flags[a.slice(2)] = true;
      } else {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      }
    } else {
      positional.push(a);
    }
  }

  const email =
    positional[0] || process.env.SUPER_ADMIN_EMAIL || '';
  const password =
    positional[1] || process.env.SUPER_ADMIN_PASSWORD || '';
  const firstName =
    (flags['first-name'] as string) ||
    process.env.SUPER_ADMIN_FIRST_NAME ||
    'Platform';
  const lastName =
    (flags['last-name'] as string) ||
    process.env.SUPER_ADMIN_LAST_NAME ||
    'Admin';
  const resetPassword = flags['reset-password'] === true;

  if (!email || !password) {
    console.error(
      'Usage: tsx scripts/createSuperAdmin.ts <email> <password> ' +
        '[--first-name=...] [--last-name=...] [--reset-password]',
    );
    console.error(
      '   or: SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... ' +
        'tsx scripts/createSuperAdmin.ts',
    );
    process.exit(1);
  }
  // Minimal hygiene — the auth route enforces stricter rules at login,
  // but we should refuse obviously bad inputs at the CLI boundary too
  // so deploy scripts fail loudly instead of writing junk.
  if (!/.+@.+\..+/.test(email)) {
    console.error(`Invalid email: ${email}`);
    process.exit(1);
  }
  if (password.length < 10) {
    console.error(
      'Password must be at least 10 characters. Pick something stronger.',
    );
    process.exit(1);
  }

  return { email, password, firstName, lastName, resetPassword };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  // The CLI may be the first ever boot — run migrations so the
  // schema exists before we try to insert. Idempotent on subsequent
  // runs (TypeORM skips already-applied migrations).
  await AppDataSource.runMigrations();

  const tenantId = await getOrCreateLegacyTenantId();
  const userRepo = AppDataSource.getRepository(User);
  const memberRepo = AppDataSource.getRepository(TenantMember);

  const normalizedEmail = args.email.trim().toLowerCase();
  const existing = await userRepo.findOne({
    where: { email: normalizedEmail, tenantId },
  });

  const passwordHash = bcrypt.hashSync(args.password, 12);

  let user: User;
  if (existing) {
    const alreadySuperAdmin = existing.role === UserRole.SUPER_ADMIN;
    if (!args.resetPassword) {
      if (alreadySuperAdmin) {
        console.log(
          `OK: ${normalizedEmail} is already a SUPER_ADMIN (userId=${existing.id}). ` +
            `No changes. Use --reset-password to rotate.`,
        );
        await AppDataSource.destroy();
        return;
      }
      console.error(
        `Refused: ${normalizedEmail} exists with role=${existing.role}. ` +
          `Re-run with --reset-password to promote AND rotate the password.`,
      );
      await AppDataSource.destroy();
      process.exit(2);
    }
    existing.passwordHash = passwordHash;
    existing.salt = 'bcrypt';
    existing.role = UserRole.SUPER_ADMIN;
    existing.isEmailVerified = true;
    existing.isBlocked = false;
    existing.blockReason = null as any;
    user = await userRepo.save(existing);
    console.log(
      `Updated: ${normalizedEmail} promoted to SUPER_ADMIN, password rotated ` +
        `(userId=${user.id}).`,
    );
  } else {
    user = await userRepo.save(
      userRepo.create({
        tenantId,
        firstName: args.firstName,
        lastName: args.lastName,
        email: normalizedEmail,
        phoneNumber: '',
        passwordHash,
        salt: 'bcrypt',
        isEmailVerified: true,
        role: UserRole.SUPER_ADMIN,
        adminPrivileges: [],
      }),
    );
    console.log(
      `Created: ${normalizedEmail} as SUPER_ADMIN (userId=${user.id}).`,
    );
  }

  // Link as OWNER of the legacy tenant so the tenant-aware admin
  // surfaces work too. Mirrors what ensureLegacyTenant does on every
  // boot, but doing it here means the operator doesn't have to start
  // the server first to gain access.
  const alreadyMember = await memberRepo.findOne({
    where: { tenantId, userId: user.id },
  });
  if (!alreadyMember) {
    await memberRepo.save(
      memberRepo.create({
        tenantId,
        userId: user.id,
        role: TenantMemberRole.OWNER,
      }),
    );
    console.log(`Linked as OWNER of tenant ${tenantId}.`);
  }

  console.log('Done. Log in at /login (or POST /api/admin/auth/login).');
  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error('createSuperAdmin failed:', err);
  try {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  } catch {
    /* ignore */
  }
  process.exit(3);
});
