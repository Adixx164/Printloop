import { Request, Response } from 'express';
import { KioskService } from '../services/kiosk.service';
import { KioskStatus } from '../entities/kiosk.entity';
import { writeAudit } from '../services/audit.service';

const kioskService = new KioskService();

/**
 * Create a new kiosk
 * POST /admin/kiosks
 */
export const createKiosk = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      name,
      location,
      campus,
      shopId,
      printerName,
      printerModel,
      ipAddress,
      notes,
      mapsUrl,
      isPublic,
    } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Kiosk name is required',
      });
      return;
    }

    const kiosk = await kioskService.createKiosk({
      name,
      location,
      campus,
      shopId,
      printerName,
      printerModel,
      ipAddress,
      notes,
      mapsUrl: mapsUrl ?? null,
      isPublic: typeof isPublic === 'boolean' ? isPublic : true,
    });

    await writeAudit(req, 'kiosk.created', `kiosk:${kiosk.id}`, {
      name: kiosk.name,
      location: kiosk.location,
      campus: kiosk.campus,
    });

    res.status(201).json({
      success: true,
      message: 'Kiosk created successfully',
      data: {
        kiosk: {
          id: kiosk.id,
          name: kiosk.name,
          location: kiosk.location,
          campus: kiosk.campus,
          apiKey: kiosk.apiKey, // Return API key only on creation
          status: kiosk.status,
          createdAt: kiosk.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Create kiosk error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create kiosk',
    });
  }
};

/**
 * List all kiosks
 * GET /admin/kiosks
 */
export const listKiosks = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, campus, location } = req.query;

    const filters: any = {};
    if (status) filters.status = status as KioskStatus;
    if (campus) filters.campus = campus as string;
    if (location) filters.location = location as string;

    const kiosks = await kioskService.listKiosks(filters);

    res.json({
      success: true,
      data: {
        kiosks: kiosks.map((k) => ({
          id: k.id,
          name: k.name,
          location: k.location,
          campus: k.campus,
          status: k.status,
          printerName: k.printerName,
          ipAddress: k.ipAddress,
          mapsUrl: k.mapsUrl,
          isPublic: k.isPublic,
          lastSeenAt: k.lastSeenAt,
          lastPrintedAt: k.lastPrintedAt,
          totalJobsPrinted: k.totalJobsPrinted,
          totalPagesPrinted: k.totalPagesPrinted,
          createdAt: k.createdAt,
          // Never return apiKey in list response
        })),
        count: kiosks.length,
      },
    });
  } catch (error) {
    console.error('List kiosks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list kiosks',
    });
  }
};

/**
 * Get single kiosk by ID
 * GET /admin/kiosks/:id
 */
export const getKiosk = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const kiosk = await kioskService.getKioskById(id);

    if (!kiosk) {
      res.status(404).json({
        success: false,
        message: 'Kiosk not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        kiosk: {
          id: kiosk.id,
          name: kiosk.name,
          location: kiosk.location,
          campus: kiosk.campus,
          shopId: kiosk.shopId,
          status: kiosk.status,
          printerName: kiosk.printerName,
          printerModel: kiosk.printerModel,
          ipAddress: kiosk.ipAddress,
          mapsUrl: kiosk.mapsUrl,
          isPublic: kiosk.isPublic,
          lastSeenAt: kiosk.lastSeenAt,
          lastPrintedAt: kiosk.lastPrintedAt,
          totalJobsPrinted: kiosk.totalJobsPrinted,
          totalPagesPrinted: kiosk.totalPagesPrinted,
          notes: kiosk.notes,
          createdAt: kiosk.createdAt,
          updatedAt: kiosk.updatedAt,
          // Never return apiKey in detail response for security
        },
      },
    });
  } catch (error) {
    console.error('Get kiosk error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get kiosk',
    });
  }
};

/**
 * Update kiosk status
 * PATCH /admin/kiosks/:id/status
 */
export const updateKioskStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!Object.values(KioskStatus).includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Invalid status. Must be ACTIVE, MAINTENANCE, OFFLINE, or DISABLED',
      });
      return;
    }

    const kiosk = await kioskService.updateKioskStatus(id, status);

    if (!kiosk) {
      res.status(404).json({
        success: false,
        message: 'Kiosk not found',
      });
      return;
    }

    await writeAudit(req, 'kiosk.status_changed', `kiosk:${kiosk.id}`, {
      status: kiosk.status,
    });

    res.json({
      success: true,
      message: 'Kiosk status updated successfully',
      data: {
        kiosk: {
          id: kiosk.id,
          name: kiosk.name,
          status: kiosk.status,
          updatedAt: kiosk.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error('Update kiosk status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update kiosk status',
    });
  }
};

/**
 * Update kiosk details
 * PATCH /admin/kiosks/:id
 */
export const updateKiosk = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating apiKey through this endpoint
    delete updates.apiKey;
    delete updates.id;
    delete updates.createdAt;
    delete updates.updatedAt;

    const kiosk = await kioskService.updateKiosk(id, updates);

    if (!kiosk) {
      res.status(404).json({
        success: false,
        message: 'Kiosk not found',
      });
      return;
    }

    await writeAudit(req, 'kiosk.updated', `kiosk:${kiosk.id}`, updates);

    res.json({
      success: true,
      message: 'Kiosk updated successfully',
      data: { kiosk },
    });
  } catch (error) {
    console.error('Update kiosk error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update kiosk',
    });
  }
};

/**
 * Regenerate API key for kiosk
 * POST /admin/kiosks/:id/regenerate-key
 */
export const regenerateApiKey = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const kiosk = await kioskService.regenerateApiKey(id);

    if (!kiosk) {
      res.status(404).json({
        success: false,
        message: 'Kiosk not found',
      });
      return;
    }

    // Don't put the new key in the audit detail — it's a secret and
    // the AuditLog table is queryable by any admin.
    await writeAudit(req, 'kiosk.api_key_regenerated', `kiosk:${kiosk.id}`);

    res.json({
      success: true,
      message: 'API key regenerated successfully',
      data: {
        kiosk: {
          id: kiosk.id,
          name: kiosk.name,
          apiKey: kiosk.apiKey, // Only return new key in this response
        },
      },
    });
  } catch (error) {
    console.error('Regenerate API key error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate API key',
    });
  }
};

/**
 * Probe the kiosk's printer reachability over the LAN.
 * POST /admin/kiosks/:id/test-connection
 *
 * Plain TCP connect to {631, 6310, 9100} on the kiosk's saved
 * `ipAddress`. Doesn't issue a real IPP request (the appliance may be
 * IPPS-only or have a self-signed cert) — a successful connect is
 * enough to distinguish "powered on, on-LAN" from "wrong IP / off".
 * Audited.
 */
export const testKioskConnection = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const kiosk = await kioskService.getKioskById(id);
    if (!kiosk) {
      res.status(404).json({ success: false, message: 'Kiosk not found' });
      return;
    }
    if (!kiosk.ipAddress) {
      res.status(400).json({
        success: false,
        message: 'This kiosk has no IP address set — edit it and add one before testing.',
      });
      return;
    }
    const result = await kioskService.testConnection(kiosk.ipAddress);
    await writeAudit(req, 'kiosk.connection_tested', `kiosk:${kiosk.id}`, {
      ok: result.ok,
      port: result.port,
    });
    res.json({
      success: true,
      data: {
        kioskId: kiosk.id,
        ipAddress: kiosk.ipAddress,
        ...result,
      },
    });
  } catch (error) {
    console.error('Test kiosk connection error:', error);
    res.status(500).json({ success: false, message: 'Failed to test connection' });
  }
};

/**
 * Get offline kiosks (haven't been seen in X minutes)
 * GET /admin/kiosks/offline
 */
export const getOfflineKiosks = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const minutesOffline = parseInt(req.query.minutes as string) || 15;

    const kiosks = await kioskService.getOfflineKiosks(minutesOffline);

    res.json({
      success: true,
      data: {
        kiosks: kiosks.map((k) => ({
          id: k.id,
          name: k.name,
          location: k.location,
          campus: k.campus,
          status: k.status,
          lastSeenAt: k.lastSeenAt,
          minutesSinceLastSeen: k.lastSeenAt
            ? Math.floor(
                (new Date().getTime() - k.lastSeenAt.getTime()) / 60000
              )
            : null,
        })),
        count: kiosks.length,
      },
    });
  } catch (error) {
    console.error('Get offline kiosks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get offline kiosks',
    });
  }
};

/**
 * Delete kiosk (soft delete by setting status to DISABLED)
 * DELETE /admin/kiosks/:id
 */
export const deleteKiosk = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const deleted = await kioskService.deleteKiosk(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        message: 'Kiosk not found',
      });
      return;
    }

    await writeAudit(req, 'kiosk.disabled', `kiosk:${id}`);

    res.json({
      success: true,
      message: 'Kiosk disabled successfully',
    });
  } catch (error) {
    console.error('Delete kiosk error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete kiosk',
    });
  }
};
