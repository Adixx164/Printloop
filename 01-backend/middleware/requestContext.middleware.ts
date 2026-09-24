import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { logger, type Logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      log?: Logger;
    }
  }
}

/**
 * Request-context middleware (V2-16).
 *
 * - Assigns a per-request id (honours an inbound `X-Request-Id` from
 *   an upstream proxy/load-balancer, else generates one).
 * - Echoes it back as `X-Request-Id` so clients + log shippers can
 *   correlate.
 * - Attaches `req.log` — a child logger pre-bound with requestId,
 *   method, and path. Downstream handlers add tenantId once resolved:
 *     `req.log = req.log.child({ tenantId: req.tenant.id })`.
 * - Logs one access line on response finish with status + duration.
 *
 * Mounted very early in app.ts (before routes) so every handler has
 * `req.log` available.
 */
export const requestContext = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const inbound = req.header('x-request-id');
  const requestId =
    inbound && inbound.length <= 128 ? inbound : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  req.log = logger.child({
    requestId,
    method: req.method,
    path: req.path,
  });

  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    // Bind tenantId if it got resolved during the request.
    const tenantId = req.tenant?.id;
    req.log!.info(
      {
        status: res.statusCode,
        durationMs,
        ...(tenantId ? { tenantId } : {}),
      },
      'request',
    );
  });

  next();
};
