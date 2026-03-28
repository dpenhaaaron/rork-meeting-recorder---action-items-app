import { z } from 'zod';
import { publicProcedure } from '../../../create-context';
import { uploadChunks } from '../chunk/route';

export const uploadStatusProcedure = publicProcedure
  .input(
    z.object({
      uploadId: z.string(),
    })
  )
  .query(async ({ input }) => {
    const { uploadId } = input;

    const chunks = uploadChunks.get(uploadId);
    if (!chunks) {
      throw new Error('Upload session not found');
    }

    const uploadedChunks = Array.from(chunks.keys());
    const etags = uploadedChunks.map((index) => ({
      index,
      etag: `etag_${index}_${Date.now()}`,
    }));

    return {
      uploadId,
      uploadedChunks,
      etags,
      totalChunks: chunks.size,
    };
  });

export default uploadStatusProcedure;
