import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Kiosk, KioskStatus } from '../database/entities/kiosk.entity';

// Extend Express Request to include kiosk
declare global {
  namespace Express {
    interface Request {
      kiosk?: Kiosk;
    }
  }
}

/**
 * Middleware to authenticate kiosk requests via X-Kiosk-Key header
 * 
 * Usage:
 * import { kioskAuth } from '../middleware/kioskAuth.middleware';
 * router.post('/printer/validate-code', kioskAuth, validateCode);
 */
export const kioskAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract API key from header
    const apiKey = req.headers['x-kiosk-key'] as string;

    if (!apiKey) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. X-Kiosk-Key header missing.',
        code: 'KIOSK_AUTH_MISSING',
      });
      return;
    }

    // Lookup kiosk by API key
    const kioskRepository = AppDataSource.getRepository(Kiosk);
    const kiosk = await kioskRepository.findOne({
      where: { apiKey },
    });

    if (!kiosk) {
      res.status(401).json({
        success: false,
        message: 'Invalid API key. Kiosk not found.',
        code: 'KIOSK_AUTH_INVALID',
      });
      return;
    }

    // Check if kiosk is disabled
    if (kiosk.status === KioskStatus.DISABLED) {
      res.status(403).json({
        success: false,
        message: 'Kiosk is disabled. Contact administrator.',
        code: 'KIOSK_DISABLED',
      });
      return;
    }

    // Check if kiosk is in maintenance mode
    if (kiosk.status === KioskStatus.MAINTENANCE) {
      res.status(503).json({
        success: false,
        message: 'Kiosk is in maintenance mode. Please try another kiosk.',
        code: 'KIOSK_MAINTENANCE',
      });
      return;
    }

    // Update last seen timestamp
    kiosk.lastSeenAt = new Date();
    await kioskRepository.save(kiosk);

    // Attach kiosk to request object
    req.kiosk = kiosk;

    next();
  } catch (error) {
    console.error('Kiosk auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
      code: 'KIOSK_AUTH_ERROR',
    });
  }
};

/**
 * Optional middleware for endpoints that work with or without kiosk auth
 * Attaches kiosk if valid key provided, but doesn't block request otherwise
 */
export const optionalKioskAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-kiosk-key'] as string;

    if (apiKey) {
      const kioskRepository = AppDataSource.getRepository(Kiosk);
      const kiosk = await kioskRepository.findOne({
        where: { apiKey },
      });

      if (kiosk && kiosk.status !== KioskStatus.DISABLED) {
        kiosk.lastSeenAt = new Date();
        await kioskRepository.save(kiosk);
        req.kiosk = kiosk;
      }
    }

    next();
  } catch (error) {
    // Silently fail - this is optional auth
    console.error('Optional kiosk auth error:', error);
    next();
  }
};
