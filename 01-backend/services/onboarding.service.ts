import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { TenantMember, TenantMemberRole } from '../entities/tenantMember.entity';
import { User, UserRole } from '../entities/user.entity';
import { Permission } from '../middleware/rbac.middleware';
import { Wallet } from '../entities/wallet.entity';
import { PayoutSchedule, PayoutCadence } from '../entities/payoutSchedule.entity';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { LEGACY_TENANT_SLUG } from '../middleware/tenant.middleware';
import { EmailService } from './email.service';

/**
 * SaaS sign-up + tenant provisioning (Dimension 5).
 *
 * One call creates everything a new printing business needs to start:
 *   - Tenant row (status=trial; commission defaults from env).
 *   - First Owner user.
 *   - TenantMember linking them.
 *   - Wallet for the owner.
 *   - PayoutSchedule (weekly Fri, ₦5k min) — default cadence.
 *   - Seeded 24-cell pricing matrix copied from the legacy defaults.
 *
 * The owner still needs to (after signup):
 *   - Verify their email (handled separately — out of scope here).
 *   - Create a Paystack subaccount via /api/saas/setup/paystack-subaccount.
 *   - Add a bank account via /api/saas/setup/bank-account.
 *
 * Until the subaccount + bank account are set, charges still work
 * (commission accumulates on Transactions) but payouts can't fire.
 */

/** Reserved slugs that no tenant may claim. */
const RESERVED_SLUGS = new Set<string>([
  LEGACY_TENANT_SLUG,
  'admin',
  'api',
  'app',
  'www',
  'mail',
  'console',
  'platform',
  'support',
  'help',
  'docs',
  'status',
  'blog',
  'about',
  'pricing',
  'login',
  'signup',
  'auth',
  'dashboard',
]);

const SLUG_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/; // 3–30 chars, lowercase, no leading/trailing dash.

/**
 * The privilege bundle the FIRST owner of a brand-new tenant receives
 * (V2-33). Every Permission except the platform-only SUPER_ADMIN
 * sentinel — owners can run their entire shop (kiosks, pricing,
 * jobs, refunds, reports, settings, audit) but cannot touch the
 * platform-wide super-admin surface.
 *
 * Owners typically delegate down to staff with narrower grants via
 * `manage_roles` — but the tenant-membership guard in
 * rbac.middleware ensures the grant is scoped to this tenant's
 * resources, not anyone else's.
 */
const OWNER_PRIVILEGES: string[] = Object.values(Permission).filter(
  (p) => p !== Permission.SUPER_ADMIN,
);

export class SlugUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SlugUnavailableError';
  }
}
export class EmailTakenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'EmailTakenError';
  }
}
export class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ValidationError';
  }
}

export interface SignupInput {
  businessName: string;
  slug: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPassword: string;
  /**
   * Shop address (V2-30 — marketplace discovery). Optional during
   * signup; if supplied we geocode and stamp lat/lng so the tenant
   * appears in /find once they flip isDiscoverable on. The tenant
   * stays out of the marketplace until that flag flips, so leaving
   * address blank here is fine — they can fill it in later from
   * /saas/settings.
   */
  address?: string;
}

export interface SignupResult {
  tenantId: string;
  tenantSlug: string;
  ownerUserId: string;
  ownerEmail: string;
  /** URL the owner should land on after signup. */
  loginUrl: string;
}

export async function signupTenant(input: SignupInput): Promise<SignupResult> {
  validate(input);

  const slug = input.slug.toLowerCase().trim();
  if (RESERVED_SLUGS.has(slug)) {
    throw new SlugUnavailableError(`'${slug}' is reserved`);
  }

  return AppDataSource.transaction(async (em) => {
    // Race-safe slug claim: a UNIQUE on tenants.slug means a concurrent
    // signup with the same slug will fail the INSERT, which surfaces
    // as a friendlier 409 in the route handler.
    const existingSlug = await em.findOne(Tenant, { where: { slug } });
    if (existingSlug) {
      throw new SlugUnavailableError(`'${slug}' is already taken`);
    }

    const email = input.ownerEmail.toLowerCase().trim();
    // Email is unique per-tenant now (after TightenTenantUniqueness),
    // but for the FIRST owner of a brand-new tenant we have to check
    // against the global universe of owners — same email twice across
    // two new tenants would be confusing UX. We check by NULL tenantId
    // OR matching this tenant's email; if the user already exists as
    // a member of another tenant, they'd reuse that account in a
    // future "join existing" flow (out of scope here).
    const existingOwnerByEmail = await em
      .createQueryBuilder(User, 'u')
      .where('LOWER(u.email) = :email', { email })
      .andWhere('u.role IN (:...roles)', {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
      })
      .getOne();
    if (existingOwnerByEmail) {
      throw new EmailTakenError(
        `${email} is already in use by another administrator`,
      );
    }

    // Best-effort geocoding (V2-30). If the caller supplied an address
    // we try once at signup so the tenant is map-ready. A geocoder
    // failure (provider down, address unparseable) MUST NOT block
    // signup — the tenant can fix it later from /saas/settings.
    let initialAddress: string | null = null;
    let initialLat: number | null = null;
    let initialLng: number | null = null;
    if (input.address && input.address.trim()) {
      initialAddress = input.address.trim();
      try {
        const { getGeocoder } = await import('./geocoding.service.js');
        const coords = await getGeocoder().geocode(initialAddress);
        if (coords) {
          initialLat = coords.lat;
          initialLng = coords.lng;
        }
      } catch (err) {
        console.warn('[signup] geocode threw, continuing:', err);
      }
    }

    const tenant = await em.save(
      em.create(Tenant, {
        name: input.businessName.trim(),
        slug,
        customDomain: null,
        status: TenantStatus.TRIAL,
        commissionPct: Number(
          process.env.COMMISSION_PCT_DEFAULT || 0.1,
        ),
        paystackSubaccountCode: null,
        suspendedAt: null,
        suspendReason: null,
        address: initialAddress,
        lat: initialLat,
        lng: initialLng,
        // Always false at signup. Tenant flips this from settings
        // once they're ready to take customers.
        isDiscoverable: false,
      }),
    );

    const passwordHash = await bcrypt.hash(input.ownerPassword, 12);
    const verificationToken = generateVerificationToken();
    const owner = await em.save(
      em.create(User, {
        tenantId: tenant.id,
        firstName: input.ownerFirstName.trim(),
        lastName: input.ownerLastName.trim(),
        email,
        phoneNumber: input.ownerPhone.trim(),
        passwordHash,
        salt: 'bcrypt',
        isEmailVerified: false,
        verificationToken,
        role: UserRole.ADMIN,
        // V2-33 fix: the previous empty array left owners unable to
        // manage their own kiosks / pricing / staff. The RBAC layer
        // is tenant-scoped (rbac.middleware verifies TenantMember on
        // top of the privilege check), so granting the full bundle
        // is safe — owners can only ever act on resources tagged with
        // their own tenantId.
        adminPrivileges: OWNER_PRIVILEGES as any,
      }),
    );

    await em.save(
      em.create(TenantMember, {
        tenantId: tenant.id,
        userId: owner.id,
        role: TenantMemberRole.OWNER,
      }),
    );

    await em.save(
      em.create(Wallet, {
        tenantId: tenant.id,
        userId: owner.id,
        balance: 0,
      }),
    );

    await em.save(
      em.create(PayoutSchedule, {
        tenantId: tenant.id,
        cadence: PayoutCadence.WEEKLY,
        dayOfWeek: 5,
        minPayoutAmount: 5000,
      }),
    );

    await seedDefaultPricing(em, tenant.id);

    // Seed a demo kiosk so the operator console isn't empty (V2-30).
    // The owner can rename / reconfigure it from /saas/operator/printers.
    await em.save(
      em.create(Kiosk, {
        tenantId: tenant.id,
        name: 'Main Kiosk',
        location: tenant.address || undefined,
        printerName: 'HP LaserJet Pro',
        status: KioskStatus.ACTIVE,
      }),
    );

    const loginUrl = buildLoginUrl(tenant.slug);
    const verifyUrl = buildVerifyUrl(tenant.slug, verificationToken);

    // Fire the verification email and SMS after the transaction commits — we
    // schedule it inside `process.nextTick` so a failed delivery
    // doesn't roll back the signup. The user can request a resend.
    process.nextTick(() => {
      const mailer = new EmailService();
      mailer
        .sendTenantOwnerVerification({
          to: owner.email,
          firstName: owner.firstName,
          businessName: tenant.name,
          token: verificationToken,
          verifyUrl,
        })
        .catch((err) =>
          console.error(
            `[onboarding] verification email send failed for ${owner.email}:`,
            err,
          ),
        );

      if (owner.phoneNumber) {
        import('./sms.service')
          .then(({ SMSService }) => {
            const sms = new SMSService();
            return sms.sendOTP(owner.phoneNumber, verificationToken);
          })
          .catch((err) =>
            console.error(
              `[onboarding] verification SMS send failed for ${owner.phoneNumber}:`,
              err,
            ),
          );
      }
    });

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      ownerUserId: owner.id,
      ownerEmail: owner.email,
      loginUrl,
    };
  });
}

/**
 * Verify an owner's email by token. Idempotent — verifying an
 * already-verified user returns success without re-issuing.
 */
export async function verifyOwnerEmail(opts: {
  token: string;
  email?: string;
}): Promise<{ verified: boolean; userId?: string; tenantSlug?: string }> {
  if (!opts.token) {
    throw new ValidationError('token is required');
  }
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);

  const where: { verificationToken: string; email?: string } = {
    verificationToken: opts.token,
  };
  if (opts.email) where.email = opts.email.toLowerCase().trim();
  const user = await userRepo.findOne({ where });
  if (!user) {
    return { verified: false };
  }
  if (!user.isEmailVerified) {
    user.isEmailVerified = true;
    user.verificationToken = null as unknown as string;
    await userRepo.save(user);
  }
  let tenantSlug: string | undefined;
  if (user.tenantId) {
    const tenant = await tenantRepo.findOne({ where: { id: user.tenantId } });
    tenantSlug = tenant?.slug;
  }
  return { verified: true, userId: user.id, tenantSlug };
}

/**
 * Resend the verification email. Re-issues the token so a leaked
 * email doesn't leave an old token still active. Rate-limit the
 * route that calls this (see saas.routes.ts).
 */
export async function resendOwnerVerification(opts: {
  email: string;
  tenantSlug?: string;
}): Promise<{ sent: boolean }> {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);

  const email = opts.email.toLowerCase().trim();
  let tenantId: string | null = null;
  if (opts.tenantSlug) {
    const tenant = await tenantRepo.findOne({
      where: { slug: opts.tenantSlug },
    });
    tenantId = tenant?.id ?? null;
  }
  const where: any = { email };
  if (tenantId) where.tenantId = tenantId;
  const user = await userRepo.findOne({ where });
  if (!user) return { sent: false };
  if (user.isEmailVerified) return { sent: false };

  const newToken = generateVerificationToken();
  user.verificationToken = newToken;
  await userRepo.save(user);

  const tenant = user.tenantId
    ? await tenantRepo.findOne({ where: { id: user.tenantId } })
    : null;
  const verifyUrl = tenant
    ? buildVerifyUrl(tenant.slug, newToken)
    : `https://printloop.app/verify-email?token=${newToken}`;

  const mailer = new EmailService();
  await mailer.sendTenantOwnerVerification({
    to: user.email,
    firstName: user.firstName,
    businessName: tenant?.name || 'PrintLoop',
    token: newToken,
    verifyUrl,
  });

  if (user.phoneNumber) {
    try {
      const { SMSService } = await import('./sms.service.js');
      const sms = new SMSService();
      await sms.sendOTP(user.phoneNumber, newToken);
    } catch (smsErr) {
      console.error(
        `[onboarding] resend verification SMS failed for ${user.phoneNumber}:`,
        smsErr,
      );
    }
  }

  return { sent: true };
}

function generateVerificationToken(): string {
  // 6-digit code: high enough entropy when combined with the email
  // address (which the verify route requires) to resist brute force,
  // low enough for a user to type from a phone.
  return String(randomInt(100_000, 1_000_000));
}

function buildVerifyUrl(slug: string, token: string): string {
  const apex = (process.env.PRINTLOOP_APEX_DOMAINS || 'printloop.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return `https://${slug}.${apex}/verify-email?token=${token}`;
}

function validate(input: SignupInput): void {
  const missing: string[] = [];
  const required: Array<[keyof SignupInput, string]> = [
    ['businessName', 'businessName'],
    ['slug', 'slug'],
    ['ownerFirstName', 'ownerFirstName'],
    ['ownerLastName', 'ownerLastName'],
    ['ownerEmail', 'ownerEmail'],
    ['ownerPhone', 'ownerPhone'],
    ['ownerPassword', 'ownerPassword'],
  ];
  for (const [key, label] of required) {
    if (!input[key] || !String(input[key]).trim()) missing.push(label);
  }
  if (missing.length) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
  if (!SLUG_RE.test(input.slug.toLowerCase().trim())) {
    throw new ValidationError(
      "Slug must be 3–30 chars, lowercase a–z / 0–9 / dashes, starting with a letter",
    );
  }
  if (input.ownerPassword.length < 10) {
    throw new ValidationError('Password must be at least 10 characters');
  }
  if (!/.+@.+\..+/.test(input.ownerEmail)) {
    throw new ValidationError('Invalid email address');
  }
}

async function seedDefaultPricing(
  em: import('typeorm').EntityManager,
  tenantId: string,
): Promise<void> {
  // Mirrors the legacy 24-cell matrix from config/database.ts → runPostInitMigrations.
  // New tenants get the same starting prices; they tweak from there.
  const DEFAULT_CELLS: Array<{
    paper: PaperSize;
    color: ColorType;
    p100Sx: number;
    p300Sx: number;
    p600Sx: number;
    p100Dx: number;
    p300Dx: number;
    p600Dx: number;
  }> = [
    { paper: PaperSize.A4, color: ColorType.BLACK_WHITE, p100Sx: 50,  p300Sx: 70,  p600Sx: 100, p100Dx: 65,  p300Dx: 90,  p600Dx: 120 },
    { paper: PaperSize.A4, color: ColorType.COLOR,       p100Sx: 100, p300Sx: 200, p600Sx: 300, p100Dx: 150, p300Dx: 250, p600Dx: 350 },
    { paper: PaperSize.A3, color: ColorType.BLACK_WHITE, p100Sx: 100, p300Sx: 150, p600Sx: 300, p100Dx: 150, p300Dx: 230, p600Dx: 400 },
    { paper: PaperSize.A3, color: ColorType.COLOR,       p100Sx: 250, p300Sx: 400, p600Sx: 650, p100Dx: 390, p300Dx: 400, p600Dx: 650 },
  ];
  for (const cell of DEFAULT_CELLS) {
    await em.save(
      em.create(PricingConfig, {
        tenantId,
        paperSize: cell.paper,
        colorType: cell.color,
        pricePerPage: cell.p300Sx,
        duplexMultiplier: 1,
        highResolutionMultiplier: 1,
        price100Simplex: cell.p100Sx,
        price300Simplex: cell.p300Sx,
        price600Simplex: cell.p600Sx,
        price100Duplex: cell.p100Dx,
        price300Duplex: cell.p300Dx,
        price600Duplex: cell.p600Dx,
        isActive: true,
        currency: 'NGN',
      }),
    );
  }
}

function buildLoginUrl(slug: string): string {
  const apex = (process.env.PRINTLOOP_APEX_DOMAINS || 'printloop.app')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return `https://${slug}.${apex}/login`;
}
