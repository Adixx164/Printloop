import { z } from "zod";
import { t } from "./init";
import { trpcDataSource } from "../../config/database";

export const publicProcedure = t.procedure
  .input(z.object({
    action: z.enum(["branding", "pricing", "health"]).optional(),
  }))
  .query(async ({ input, ctx }) => {
    if (input.action === "branding") {
      return { branding: { colors: ["#4F46E5", "#1A1410"], font: "Geist" } };
    }

    if (input.action === "pricing") {
      return { pricing: { fromBwA4: "₦5", fromColourA4: "₦25" } };
    }

    return { health: { status: "ok" } };
  });