import { z } from "zod";
import { t } from "./init";
import { trpcDataSource } from "../../config/database";

export const saasProcedure = t.procedure
  .input(z.object({
    action: z.enum(["list", "status"]).optional(),
    tenantId: z.string().optional(),
  }))
  .query(async ({ input, ctx }) => {
    const repo = trpcDataSource.getRepository("tenant");

    if (input.action === "list") {
      const tenants = await repo.find({
        select: ["id", "slug", "name", "status", "createdAt"],
        order: { createdAt: "DESC" },
      });
      return { tenants };
    }

    if (input.tenantId) {
      const tenant = await repo.findOne({
        where: { id: input.tenantId },
        relations: ["members", "brands"],
      });
      return { tenant };
    }

    return { tenant: null };
  });