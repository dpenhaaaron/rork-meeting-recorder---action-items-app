import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  currentChunk: number;
  totalChunks: number;
  stage: 'uploading' | 'processing' | 'completed' | 'error';
  message: string;
}

export interface ChunkUploadResult {
  uploadId: string;
  chunkIndex: number;
  etag?: string;
  success: boolean;
}

export interface UploadSession {
  uploadId: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  uploadedChunks: Set<number>;
  etags: Map<number, string>;
}

export class ChunkedUploadService {
  private sessions: Map<string, UploadSession> = new Map();
  private baseUrl: string;

  constructor(baseUrl: string = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async initializeUpload(
    fileName: string,
    fileSize: number,
    mimeType: string
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/trpc/upload.initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        fileSize,
        mimeType,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize upload: ${response.statusText}`);
    }

    const result = await response.json();
    const uploadId = result.result.data.uploadId;

    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    this.sessions.set(uploadId, {
      uploadId,
      fileName,
      totalSize: fileSize,
      totalChunks,
      uploadedChunks: new Set(),
      etags: new Map(),
    });

    return uploadId;
  }

  async uploadChunk(
    uploadId: string,
    chunkIndex: number,
    chunkData: Blob | string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<ChunkUploadResult> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        const formData = new FormData();
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', chunkIndex.toString());

        if (typeof chunkData === 'string') {
          // Mobile: file URI
          formData.append('chunk', {
            uri: chunkData,
            name: `chunk_${chunkIndex}`,
            type: 'application/octet-stream',
          } as any);
        } else {
          // Web: Blob
          formData.append('chunk', chunkData, `chunk_${chunkIndex}`);
        }

        const response = await fetch(`${this.baseUrl}/api/trpc/upload.chunk`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Chunk upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        const etag = result.result.data.etag;

        session.uploadedChunks.add(chunkIndex);
        if (etag) {
          session.etags.set(chunkIndex, etag);
        }

        if (onProgress) {
          const uploadedBytes = session.uploadedChunks.size * CHUNK_SIZE;
          onProgress({
            uploadedBytes,
            totalBytes: session.totalSize,
            percentage: Math.round((uploadedBytes / session.totalSize) * 100),
            currentChunk: chunkIndex + 1,
            totalChunks: session.totalChunks,
            stage: 'uploading',
            message: `Uploading chunk ${chunkIndex + 1} of ${session.totalChunks}`,
          });
        }

        return {
          uploadId,
          chunkIndex,
          etag,
          success: true,
        };
      } catch (error) {
        retries++;
        if (retries >= MAX_RETRIES) {
          console.error(`Failed to upload chunk ${chunkIndex} after ${MAX_RETRIES} retries:`, error);
          throw error;
        }
        console.log(`Retrying chunk ${chunkIndex} (attempt ${retries + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
      }
    }

    throw new Error(`Failed to upload chunk ${chunkIndex}`);
  }

  async uploadFile(
    fileUri: string,
    fileName: string,
    mimeType: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<string> {
    let fileSize: number;
    let totalChunks: number;

    if (Platform.OS === 'web') {
      // Web: Handle Blob/File
      const blob = await this.getWebBlob(fileUri);
      fileSize = blob.size;
      totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

      const uploadId = await this.initializeUpload(fileName, fileSize, mimeType);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const chunkBlob = blob.slice(start, end);

        await this.uploadChunk(uploadId, i, chunkBlob, onProgress);
      }

      return await this.finalizeUpload(uploadId, onProgress);
    } else {
      // Mobile: Handle file URI
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists || !('size' in fileInfo)) {
        throw new Error('File not found or invalid');
      }

      fileSize = fileInfo.size;
      totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

      const uploadId = await this.initializeUpload(fileName, fileSize, mimeType);

      // For mobile, we'll read and upload chunks sequentially
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const length = Math.min(CHUNK_SIZE, fileSize - start);

        // Read chunk from file
        const chunkBase64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
          position: start,
          length,
        });

        // Convert base64 to blob for upload
        const chunkBlob = this.base64ToBlob(chunkBase64, 'application/octet-stream');

        await this.uploadChunk(uploadId, i, chunkBlob, onProgress);
      }

      return await this.finalizeUpload(uploadId, onProgress);
    }
  }

  async finalizeUpload(
    uploadId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<string> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    if (onProgress) {
      onProgress({
        uploadedBytes: session.totalSize,
        totalBytes: session.totalSize,
        percentage: 100,
        currentChunk: session.totalChunks,
        totalChunks: session.totalChunks,
        stage: 'processing',
        message: 'Finalizing upload...',
      });
    }

    const response = await fetch(`${this.baseUrl}/api/trpc/upload.finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        etags: Array.from(session.etags.entries()).map(([index, etag]) => ({
          index,
          etag,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to finalize upload: ${response.statusText}`);
    }

    const result = await response.json();
    this.sessions.delete(uploadId);

    return result.result.data.fileKey;
  }

  async resumeUpload(uploadId: string): Promise<UploadSession | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/trpc/upload.status?uploadId=${uploadId}`);
      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      const status = result.result.data;

      const session: UploadSession = {
        uploadId,
        fileName: status.fileName,
        totalSize: status.totalSize,
        totalChunks: status.totalChunks,
        uploadedChunks: new Set(status.uploadedChunks),
        etags: new Map(status.etags.map((e: any) => [e.index, e.etag])),
      };

      this.sessions.set(uploadId, session);
      return session;
    } catch (error) {
      console.error('Failed to resume upload:', error);
      return null;
    }
  }

  private async getWebBlob(fileUri: string): Promise<Blob> {
    if (fileUri.startsWith('indexeddb://')) {
      const meetingId = fileUri.replace('indexeddb://', '');
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('MeetingRecorderDB', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['audioFiles'], 'readonly');
          const store = transaction.objectStore('audioFiles');
          const getRequest = store.get(meetingId);
          getRequest.onsuccess = () => {
            const result = getRequest.result;
            if (result && result.blob) {
              resolve(result.blob);
            } else {
              reject(new Error('Blob not found in IndexedDB'));
            }
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
      });
    }
    throw new Error('Invalid file URI for web');
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  getSession(uploadId: string): UploadSession | undefined {
    return this.sessions.get(uploadId);
  }

  cancelUpload(uploadId: string): void {
    this.sessions.delete(uploadId);
  }
}

export const chunkedUploadService = new ChunkedUploadService();
