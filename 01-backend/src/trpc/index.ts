import "reflect-metadata";
import { DataSource } from "typeorm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { AppDataSource, trpcDataSource } from "../../config/database";
import { authProcedure } from "./auth.procedure";
import { renderProcedure } from "./render.procedure";
import { saasProcedure } from "./saas.procedure";
import { customerProcedure } from "./customer.procedure";
import { adminProcedure } from "./admin.procedure";
import { publicProcedure } from "./public.procedure";
import { t, z } from "./init";

// Base procedure with ctx that provides db
const createContext = async () => ({
  db: trpcDataSource,
});

// Public procedures — no auth required (branding, pricing, health)
const publicRouter = t.router({
  branding: publicProcedure,
  health: t.procedure.input(z.object({ action: z.enum(["health"]).optional() })).query(async ({ input }) => {
    const action = input.action ?? "health";
    return { status: "ok", timestamp: new Date().toISOString() };
  }),

  pricing: t.procedure.input(z.object({ action: z.enum(["pricing"]).optional() })).query(async ({ input }) => {
    const action = input.action ?? "pricing";
    return { fromBwA4: "₦5", fromColourA4: "₦25" };
  }),

  // Document edit (placeholder)
  documentEdit: t.procedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ input }) => {
      return { documentId: input.documentId };
    }),
});

// Tenant procedures — require tenant resolution via middleware
const tenantRouter = t.router({
  tenant: t.procedure.query(async () => {
    return { tenant: null };
  }),

  // Render workflow
  render: renderProcedure,

  // SaaS admin procedures
  saas: saasProcedure,

  // Customer procedures
  customer: customerProcedure,

  // Admin procedures
  admin: adminProcedure,
});

// Root router combining all sections
export const tRouter = t.router({
  // Public API — no tenant context needed
  public: publicRouter,

  // Tenant-scoped API
  tenant: tenantRouter,

  // Auth procedure (used by frontend forms)
  auth: authProcedure,
});

// Create the Express handler for tRPC
export const trpcHandler = createExpressMiddleware({
  router: tRouter,
  createContext,
});

export type AppRouter = typeof tRouter;