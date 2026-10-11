import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";

export const t = initTRPC.create({
  transformer: superjson,
});

export const publicProcedure = t.procedure;
export { z };