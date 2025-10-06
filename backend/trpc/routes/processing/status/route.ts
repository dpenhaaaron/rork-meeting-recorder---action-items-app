import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { getJobStatus } from '../job-queue';

export const processingStatusProcedure = publicProcedure
  .input(
    z.object({
      jobId: z.string(),
    })
  )
  .query(async ({ input }) => {
    const { jobId } = input;

    const job = getJobStatus(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      message: job.message,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  });

export default processingStatusProcedure;
