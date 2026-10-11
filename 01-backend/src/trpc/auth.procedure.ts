import { z } from "zod";
import { t } from "./init";
import { trpcDataSource } from "../../config/database";

export const authProcedure = t.procedure
  .input(z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }))
  .use(async ({ next, ctx }) => {
    // TODO: implement actual auth logic with password verification
    // For now, just return null user
    return next({ ctx: { ...ctx, user: null } });
  })
  .query(async ({ input, ctx }) => {
    const userRepo = trpcDataSource.getRepository("user");
    const user = await userRepo.findOne({ where: { email: input.email } });
    return { user };
  });