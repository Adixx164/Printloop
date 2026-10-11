import { z } from "zod";
import { t } from "./init";
import { trpcDataSource } from "../../config/database";

export const renderProcedure = t.procedure
  .input(z.object({
    jobId: z.string(),
  }))
  .query(async ({ input, ctx }) => {
    const job = await trpcDataSource.getRepository("printJob").findOne({
      where: { id: input.jobId },
      relations: ["tenant"],
    });

    if (!job) {
      return { error: "Job not found" };
    }

    return { job };
  });