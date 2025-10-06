import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

export const initiateUploadProcedure = publicProcedure
  .input(
    z.object({
      fileName: z.string(),
      fileSize: z.number(),
      mimeType: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    console.log('Initiating upload:', {
      uploadId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
    });

    return {
      uploadId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      createdAt: new Date().toISOString(),
    };
  });

export default initiateUploadProcedure;
