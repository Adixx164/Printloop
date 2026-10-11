import { z } from "zod";
import { t } from "./init";
import { trpcDataSource } from "../../config/database";

export const customerProcedure = t.procedure
  .input(z.object({
    action: z.enum(["profile", "orders", "settings"]).optional(),
    userId: z.string().optional(),
  }))
  .query(async ({ input, ctx }) => {
    const repo = trpcDataSource.getRepository("user");

    if (input.action === "profile" && input.userId) {
      const user = await repo.findOne({
        where: { id: input.userId },
        relations: ["tenant"],
      });
      return { user };
    }

    if (input.action === "orders" && input.userId) {
      const orders = await trpcDataSource.getRepository("printJob").find({
        where: { tenant: { id: input.userId } },
        relations: ["tenant"],
        order: { createdAt: "DESC" },
      });
      return { orders };
    }

    if (input.action === "settings" && input.userId) {
      const user = await repo.findOne({
        where: { id: input.userId },
        relations: ["tenant"],
      });
      return { settings: user?.tenant?.settings };
    }

    return { user: null, orders: [], settings: null };
  });