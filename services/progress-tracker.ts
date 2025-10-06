import { trpcClient } from '@/lib/trpc';

export interface ProcessingStatus {
  jobId: string;
  status: 'queued' | 'transcribing' | 'analyzing' | 'completed' | 'error';
  progress: number;
  message: string;
  result?: {
    transcript: string;
    artifacts: any;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class ProgressTracker {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private callbacks: Map<string, (status: ProcessingStatus) => void> = new Map();

  startTracking(
    jobId: string,
    onProgress: (status: ProcessingStatus) => void,
    pollIntervalMs: number = 2000
  ): void {
    this.callbacks.set(jobId, onProgress);

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      await this.checkStatus(jobId);
    }, pollIntervalMs);

    this.checkStatus(jobId);
  }

  stopTracking(jobId: string): void {
    this.callbacks.delete(jobId);

    if (this.callbacks.size === 0 && this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async checkStatus(jobId: string): Promise<void> {
    try {
      const callback = this.callbacks.get(jobId);
      if (!callback) {
        return;
      }

      const status = await trpcClient.processing.status.query({ jobId });

      callback(status as ProcessingStatus);

      if (status.status === 'completed' || status.status === 'error') {
        this.stopTracking(jobId);
      }
    } catch (error) {
      console.error(`Failed to check status for job ${jobId}:`, error);
      
      const callback = this.callbacks.get(jobId);
      if (callback) {
        callback({
          jobId,
          status: 'error',
          progress: 0,
          message: 'Failed to check processing status',
          error: error instanceof Error ? error.message : 'Unknown error',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  stopAll(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.callbacks.clear();
  }
}

export const progressTracker = new ProgressTracker();
