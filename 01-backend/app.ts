import "reflect-metadata";
import express, { type Application } from "express";
import cors from "cors";
import devApiRoutes from "./routes/devApi.routes.js";
import adminAuthRoutes from "./routes/adminAuth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminKioskRoutes from "./routes/admin-kiosk.routes.js";
import groupSessionRoutes from "./routes/groupSession.routes.js";
import participantUploadRoutes from "./routes/participantUpload.routes.js";
import printerRoutes from "./routes/printer.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import customerAuthRoutes from "./routes/customerAuth.routes.js";
import customerPrintRoutes from "./routes/customerPrint.routes.js";
import cupsRoutes from "./routes/cups.routes.js";
import publicPricingRoutes from "./routes/publicPricing.routes.js";
import { authenticate } from "./middleware/auth.middleware.js";
import { UPLOAD_DIR } from "./utils/fileStore.js";

export function createApp(): Application {
  const app = express();

  // Appliance endpoints (kiosk panel, participant-upload device) are
  // separate installs on their own origin and authenticate with a header
  // key — not cookies — so origin reflection is safe here. Mounted BEFORE
  // the strict global CORS so their preflights are handled permissively.
  const applianceCors = cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Kiosk-Key", "X-Upload-Token", "Authorization"],
  });
  app.use("/api/printer", applianceCors);
  app.use("/api/agent", applianceCors);
  app.use("/api/participant-upload", applianceCors);

  app.use(
    cors({
      origin: (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(","),
      credentials: true,
    }),
  );

  // Capture the raw JSON body alongside the parsed copy. The Paystack
  // webhook signs raw bytes (HMAC-SHA512) — re-serialising the parsed
  // object would change the bytes and break verification.
  app.use(
    express.json({
      limit: "10mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "1.0.0",
    });
  });

  // ── Real TypeORM-backed admin API (new REST contract) ──────────────────
  // Order matters: auth (public login) → kiosks → generic admin → dev mock.
  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/kiosks", authenticate, adminKioskRoutes);
  app.use("/api/admin", authenticate, adminRoutes);

  // ── Real TypeORM-backed feature APIs (distinct prefixes; the legacy
  //    customer mock keeps its own /api/group-sessions etc.) ─────────────
  app.use("/api/groups", groupSessionRoutes);
  app.use("/api/participant-upload", participantUploadRoutes);
  app.use("/api/printer", printerRoutes);
  // Kiosk-pull agent API: on-site agent polls for RELEASING jobs, fetches
  // bytes via signed URLs, dispatches to LAN printer, reports back. Auth
  // is the same X-Kiosk-Key header the kiosk uses for /api/printer.
  app.use("/api/agent", agentRoutes);
  app.use("/api/payments", paymentsRoutes);

  // Public pricing matrix — readable by anonymous flows (group-participant
  // upload, landing page). Same data the admin sets and the customer app
  // sees, just without JWT requirement.
  app.use("/api/pricing", publicPricingRoutes);

  // ── "PrintLoop as a network printer" — CUPS ingress (token-auth, no JWT).
  //    A laptop adds PrintLoop as a CUPS printer; that backend POSTs here.
  app.use("/api/cups", cupsRoutes);

  // ── Real TypeORM-backed customer API (auth + real print jobs) ──────────
  app.use("/api/customer/auth", customerAuthRoutes);
  app.use("/api/customer", authenticate, customerPrintRoutes);

  // Uploaded documents — fetchable by the kiosk/IPP service (public, no auth)
  app.use("/api/files", express.static(UPLOAD_DIR));

  // ── Remaining customer mock API (wallet/stations/options; JWT-bridged) ──
  app.use("/api", devApiRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Endpoint not found" });
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Map multer errors to proper 4xx instead of leaking 500s.
    if (err && err.name === "MulterError") {
      const code = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(code).json({
        success: false,
        message: err.code === "LIMIT_FILE_SIZE" ? "File too large." : `Upload rejected: ${err.message}`,
        code: err.code,
      });
      return;
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, message: err?.message || "Internal server error" });
  });

  return app;
}
