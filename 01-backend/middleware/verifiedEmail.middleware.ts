import { Request, Response, NextFunction } from 'express';
import { User, UserRole } from '../entities/user.entity';

/**
 * Require the authenticated user's email to be verified.
 *
 * Used on tenant-config routes that should not run before the owner
 * proves they control the email address — most importantly the
 * Paystack subaccount setup and the bank-account-for-payouts form.
 * Without this gate, an unverified attacker who guessed someone's
 * fresh password (or compromised a poorly-protected signup link)
 * could redirect that tenant's customer payments to a different
 * account before the real owner notices.
 *
 * Bypasses:
 *   - SUPER_ADMIN — platform operators may help a tenant fix things
 *     even before verification (impersonation tooling later in
 *     Dimension 11).
 *
 * Must run AFTER `authenticate`. The middleware reads `req.user`,
 * not the DB, so the verification flip is effective the next time
 * the user logs in (or refreshes their token).
 */
export const requireVerifiedEmail = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }
  if (user.role === UserRole.SUPER_ADMIN) {
    next();
    return;
  }
  if (!user.isEmailVerified) {
    res.status(403).json({
      success: false,
      message: 'Verify your email before completing this step',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return;
  }
  next();
};
