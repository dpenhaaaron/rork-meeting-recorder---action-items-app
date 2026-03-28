import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

const uploadChunks = new Map<string, Map<number, Buffer>>();

export const uploadChunkProcedure = publicProcedure
  .input(
    z.object({
      uploadId: z.string(),
      chunkIndex: z.number(),
      chunk: z.any(),
    })
  )
  .mutation(async ({ input }) => {
    const { uploadId, chunkIndex, chunk } = input;

    if (!uploadChunks.has(uploadId)) {
      uploadChunks.set(uploadId, new Map());
    }

    const chunks = uploadChunks.get(uploadId)!;
    
    let chunkBuffer: Buffer;
    if (Buffer.isBuffer(chunk)) {
      chunkBuffer = chunk;
    } else if (typeof chunk === 'string') {
      chunkBuffer = Buffer.from(chunk, 'base64');
    } else if (chunk.data) {
      chunkBuffer = Buffer.from(chunk.data);
    } else {
      throw new Error('Invalid chunk data format');
    }

    chunks.set(chunkIndex, chunkBuffer);

    const etag = `etag_${chunkIndex}_${Date.now()}`;

    console.log(`Chunk ${chunkIndex} uploaded for ${uploadId}, size: ${chunkBuffer.length} bytes`);

    return {
      uploadId,
      chunkIndex,
      etag,
      success: true,
    };
  });

export { uploadChunks };
export default uploadChunkProcedure;
