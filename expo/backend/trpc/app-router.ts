import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import initiateUploadProcedure from "./routes/upload/initiate/route";
import uploadChunkProcedure from "./routes/upload/chunk/route";
import finalizeUploadProcedure from "./routes/upload/finalize/route";
import uploadStatusProcedure from "./routes/upload/status/route";
import processingStatusProcedure from "./routes/processing/status/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  upload: createTRPCRouter({
    initiate: initiateUploadProcedure,
    chunk: uploadChunkProcedure,
    finalize: finalizeUploadProcedure,
    status: uploadStatusProcedure,
  }),
  processing: createTRPCRouter({
    status: processingStatusProcedure,
  }),
});

export type AppRouter = typeof appRouter;