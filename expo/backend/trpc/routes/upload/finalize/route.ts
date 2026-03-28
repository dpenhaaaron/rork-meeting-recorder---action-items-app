import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { uploadChunks } from '../chunk/route';
import { createProcessingJob } from '../../processing/job-queue';

export const finalizeUploadProcedure = publicProcedure
  .input(
    z.object({
      uploadId: z.string(),
      etags: z.array(
        z.object({
          index: z.number(),
          etag: z.string(),
        })
      ),
    })
  )
  .mutation(async ({ input }) => {
    const { uploadId } = input;

    const chunks = uploadChunks.get(uploadId);
    if (!chunks) {
      throw new Error('Upload session not found');
    }

    const sortedChunks = Array.from(chunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, buffer]) => buffer);

    const completeFile = Buffer.concat(sortedChunks);
    
    const fileKey = `audio_${uploadId}_${Date.now()}`;
    
    console.log(`Finalized upload ${uploadId}, total size: ${completeFile.length} bytes`);

    const jobId = await createProcessingJob({
      fileKey,
      uploadId,
      audioBuffer: completeFile,
      fileSize: completeFile.length,
    });

    uploadChunks.delete(uploadId);

    return {
      fileKey,
      jobId,
      fileSize: completeFile.length,
      finalizedAt: new Date().toISOString(),
    };
  });

export default finalizeUploadProcedure;
