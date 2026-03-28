interface ProcessingJob {
  jobId: string;
  fileKey: string;
  uploadId: string;
  audioBuffer: Buffer;
  fileSize: number;
  status: 'queued' | 'transcribing' | 'analyzing' | 'completed' | 'error';
  progress: number;
  message: string;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const jobQueue = new Map<string, ProcessingJob>();
const processingWorkers = new Set<string>();
const MAX_CONCURRENT_JOBS = 3;

export async function createProcessingJob(params: {
  fileKey: string;
  uploadId: string;
  audioBuffer: Buffer;
  fileSize: number;
}): Promise<string> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const job: ProcessingJob = {
    jobId,
    fileKey: params.fileKey,
    uploadId: params.uploadId,
    audioBuffer: params.audioBuffer,
    fileSize: params.fileSize,
    status: 'queued',
    progress: 0,
    message: 'Job queued for processing',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jobQueue.set(jobId, job);
  console.log(`Created processing job ${jobId} for file ${params.fileKey}`);

  processNextJob();

  return jobId;
}

export function getJobStatus(jobId: string): ProcessingJob | undefined {
  return jobQueue.get(jobId);
}

export function getAllJobs(): ProcessingJob[] {
  return Array.from(jobQueue.values());
}

async function processNextJob(): Promise<void> {
  if (processingWorkers.size >= MAX_CONCURRENT_JOBS) {
    console.log('Max concurrent jobs reached, waiting...');
    return;
  }

  const queuedJob = Array.from(jobQueue.values()).find(
    (job) => job.status === 'queued'
  );

  if (!queuedJob) {
    return;
  }

  processingWorkers.add(queuedJob.jobId);
  console.log(`Starting processing job ${queuedJob.jobId}`);

  try {
    await processJob(queuedJob);
  } catch (error) {
    console.error(`Job ${queuedJob.jobId} failed:`, error);
    queuedJob.status = 'error';
    queuedJob.error = error instanceof Error ? error.message : 'Unknown error';
    queuedJob.updatedAt = new Date();
  } finally {
    processingWorkers.delete(queuedJob.jobId);
    processNextJob();
  }
}

async function processJob(job: ProcessingJob): Promise<void> {
  try {
    job.status = 'transcribing';
    job.progress = 10;
    job.message = 'Transcribing audio...';
    job.updatedAt = new Date();

    const audioBase64 = job.audioBuffer.toString('base64');
    const audioBlob = Buffer.from(audioBase64, 'base64');

    const formData = new FormData();
    const blob = new Blob([audioBlob], { type: 'audio/webm' });
    formData.append('audio', blob, 'recording.webm');

    console.log(`Transcribing audio for job ${job.jobId}, size: ${job.fileSize} bytes`);

    const transcribeResponse = await fetch('https://toolkit.rork.com/stt/transcribe/', {
      method: 'POST',
      body: formData,
    });

    if (!transcribeResponse.ok) {
      throw new Error(`Transcription failed: ${transcribeResponse.statusText}`);
    }

    const transcribeResult = await transcribeResponse.json();
    const transcript = transcribeResult.text;

    if (!transcript || transcript.length < 5) {
      throw new Error('Transcription result is empty or too short');
    }

    console.log(`Transcription completed for job ${job.jobId}, length: ${transcript.length} characters`);

    job.status = 'analyzing';
    job.progress = 50;
    job.message = 'Analyzing transcript...';
    job.updatedAt = new Date();

    const artifacts = await analyzeTranscript(transcript, job.jobId);

    job.status = 'completed';
    job.progress = 100;
    job.message = 'Processing completed';
    job.result = {
      transcript,
      artifacts,
    };
    job.updatedAt = new Date();

    console.log(`Job ${job.jobId} completed successfully`);
  } catch (error) {
    console.error(`Error processing job ${job.jobId}:`, error);
    throw error;
  }
}

async function analyzeTranscript(transcript: string, jobId: string): Promise<any> {
  console.log(`Analyzing transcript for job ${jobId}`);

  const systemPrompt = `Extract meeting insights from the transcript. Return ONLY a JSON object with this schema:
{
  "action_items": [{"id": "string", "title": "string", "assignee": "string", "priority": "High|Medium|Low", "status": "Not Started"}],
  "decisions": [{"id": "string", "statement": "string", "rationale": "string"}],
  "open_questions": [{"id": "string", "question": "string", "owner": "string"}],
  "summaries": {
    "executive_120w": "string",
    "detailed_400w": "string",
    "bullet_12": ["string"]
  }
}
Do not wrap in markdown code blocks. Return only valid JSON.`;

  try {
    const response = await fetch('https://toolkit.rork.com/text/llm/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Transcript:\n${transcript.substring(0, 8000)}` },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }

    const result = await response.json();
    const cleanedResponse = result.completion.replace(/```(?:json)?\s*|\s*```/g, '').trim();
    const artifacts = JSON.parse(cleanedResponse);

    return artifacts;
  } catch (error) {
    console.error('Analysis failed, returning fallback:', error);
    return {
      action_items: [],
      decisions: [],
      open_questions: [],
      summaries: {
        executive_120w: 'Analysis failed',
        detailed_400w: 'Analysis failed',
        bullet_12: ['Analysis failed'],
      },
    };
  }
}

export function cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [jobId, job] of jobQueue.entries()) {
    if (now - job.createdAt.getTime() > maxAgeMs) {
      jobQueue.delete(jobId);
      console.log(`Cleaned up old job ${jobId}`);
    }
  }
}

setInterval(() => cleanupOldJobs(), 60 * 60 * 1000);
