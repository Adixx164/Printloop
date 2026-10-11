import { z } from "zod";
import { t } from "./init";
import { trpcDataSource } from "../../config/database";

export const adminProcedure = t.procedure
  .input(z.object({
    action: z.enum(["tenants", "stats", "users"]).optional(),
    tenantId: z.string().optional(),
  }))
  .query(async ({ input, ctx }) => {
    const repo = trpcDataSource.getRepository("tenant");

    if (input.action === "tenants") {
      const tenants = await repo.find({
        select: ["id", "slug", "name", "status", "createdAt"],
        order: { createdAt: "DESC" },
      });
      return { tenants };
    }

    if (input.action === "stats" && input.tenantId) {
      const jobRepo = trpcDataSource.getRepository("printJob");
      const total = await jobRepo.count({ where: { tenant: { id: input.tenantId } } });
      const completed = await jobRepo.count({
        where: { tenant: { id: input.tenantId }, status: "completed" },
      });
      return { total, completed };
    }

    if (input.action === "users" && input.tenantId) {
      const userRepo = trpcDataSource.getRepository("user");
      const users = await userRepo.find({
        where: { tenant: { id: input.tenantId } },
        select: ["id", "email", "role", "createdAt"],
        order: { createdAt: "DESC" },
      });
      return { users };
    }

    return { tenants: [], stats: null, users: null };
  });