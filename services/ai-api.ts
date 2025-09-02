import { MeetingArtifacts, EmailDraft } from '@/types/meeting';

const AI_BASE_URL = 'https://toolkit.rork.com';
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds base backoff for better stability
const CHUNK_DURATION = 60; // seconds per chunk (removed chunking by time)
const CHUNK_OVERLAP = 5; // 5 seconds overlap
const MAX_CHUNK_TOKENS = 1000; // increased chunk tokens
const MAX_TRANSCRIPT_LENGTH = 8000; // higher ceiling before chunking
const CHUNK_SIZE_LIMIT = 2000; // larger chunks for fewer API calls

export interface TranscribeRequest {
  audio: File | { uri: string; name: string; type: string };
  language?: string;
}

export interface TranscribeResponse {
  text: string;
  language: string;
}

export interface ProcessTranscriptRequest {
  transcript: string;
  attendees?: string[];
  meetingTitle?: string;
  meetingDate?: string;
}

export interface EmailDraftRequest {
  meetingTitle: string;
  meetingDate: string;
  attendees: string[];
  artifacts: MeetingArtifacts;
}

export interface ProcessingProgress {
  stage: 'transcribing' | 'chunking' | 'mapping' | 'reducing' | 'refining' | 'generating_email' | 'completed';
  progress: number;
  message: string;
  currentChunk?: number;
  totalChunks?: number;
}

export type ProgressCallback = (progress: ProcessingProgress) => void;

// Chunk processing interfaces
export interface AudioChunk {
  id: string;
  startTime: number;
  endTime: number;
  audioBlob?: Blob;
  audioUri?: string;
  transcript?: string;
  processed?: boolean;
}

export interface ChunkSummary {
  id: string;
  summary: string;
  actionItems: any[];
  decisions: any[];
  questions: any[];
  startTime: number;
  endTime: number;
}

export interface SectionSummary {
  id: string;
  summary: string;
  actionItems: any[];
  decisions: any[];
  questions: any[];
  startTime: number;
  endTime: number;
  chunkIds: string[];
}

// Utility function for retrying failed requests
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      console.log(`Request failed, retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2); // Exponential backoff
    }
    throw error;
  }
};

// Audio chunking utilities
const createAudioChunks = async (
  audioFile: File | { uri: string; name: string; type: string },
  duration: number
): Promise<AudioChunk[]> => {
  const chunks: AudioChunk[] = [];
  const totalChunks = Math.ceil(duration / CHUNK_DURATION);
  
  for (let i = 0; i < totalChunks; i++) {
    const startTime = Math.max(0, i * CHUNK_DURATION - (i > 0 ? CHUNK_OVERLAP : 0));
    const endTime = Math.min(duration, (i + 1) * CHUNK_DURATION);
    
    chunks.push({
      id: `chunk_${i}`,
      startTime,
      endTime,
      processed: false
    });
  }
  
  return chunks;
};

// Chunk-level processing (Map phase)
const processChunk = async (
  transcript: string,
  meetingContext: string,
  chunkId: string
): Promise<ChunkSummary> => {
  return retryWithBackoff(async () => {
    const systemPrompt = `Extract facts from this transcript chunk. Output strict JSON only.
Schema: {
  "chunk_summary": "<≤150 words>",
  "action_items": [{
    "title": "string",
    "assignee": "string",
    "assignee_email": null,
    "due_date": null,
    "priority": "Medium",
    "status": "Not Started",
    "source_quote": "string",
    "confidence": 0.8,
    "tags": []
  }],
  "decisions": [{
    "statement": "string",
    "source_quote": "string",
    "confidence": 0.8,
    "tags": []
  }],
  "open_questions": [{
    "question": "string",
    "owner": null,
    "needed_by": null,
    "source_quote": "string"
  }]
}
Rules: Only explicit commitments. If uncertain, lower confidence. JSON only.`;

    const response = await fetch(`${AI_BASE_URL}/text/llm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${meetingContext}\n\nChunk transcript:\n${transcript}` },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Chunk processing failed (${response.status})`);
    }
    
    const result = await response.json();
    const cleanedResponse = extractJSONFromResponse(result.completion);
    const parsed = JSON.parse(cleanedResponse);
    
    return {
      id: chunkId,
      summary: parsed.chunk_summary || '',
      actionItems: Array.isArray(parsed.action_items) ? parsed.action_items.map((item: any, index: number) => ({
        ...item,
        id: `${chunkId}_action_${index}`,
        title: item.title || 'Untitled Action Item',
        assignee: item.assignee || 'Unassigned',
        priority: item.priority || 'Medium',
        status: item.status || 'Not Started',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.8
      })) : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map((item: any, index: number) => ({
        ...item,
        id: `${chunkId}_decision_${index}`,
        statement: item.statement || 'Decision not specified',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.8
      })) : [],
      questions: Array.isArray(parsed.open_questions) ? parsed.open_questions.map((item: any, index: number) => ({
        ...item,
        id: `${chunkId}_question_${index}`,
        question: item.question || 'Question not specified'
      })) : [],
      startTime: 0,
      endTime: 0
    };
  });
};

// Section-level processing (Reduce phase)
const reduceSections = async (
  chunkSummaries: ChunkSummary[],
  meetingContext: string
): Promise<SectionSummary[]> => {
  const sections: SectionSummary[] = [];
  const chunksPerSection = 3; // Process 3 chunks per section
  
  for (let i = 0; i < chunkSummaries.length; i += chunksPerSection) {
    const sectionChunks = chunkSummaries.slice(i, i + chunksPerSection);
    
    const systemPrompt = `Merge and deduplicate chunk summaries. Output strict JSON only.
Schema: {
  "section_summary": "<≤250 words>",
  "action_items": [...],
  "decisions": [...],
  "open_questions": [...]
}
Rules: Deduplicate by normalized title+assignee. Prefer entries with due dates. JSON only.`;
    
    const userPrompt = `Chunk summaries:\n${sectionChunks.map(c => c.summary).join('\n\n')}\n\nAction items:\n${JSON.stringify(sectionChunks.flatMap(c => c.actionItems))}\n\nDecisions:\n${JSON.stringify(sectionChunks.flatMap(c => c.decisions))}\n\nQuestions:\n${JSON.stringify(sectionChunks.flatMap(c => c.questions))}`;
    
    const response = await fetch(`${AI_BASE_URL}/text/llm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`Section processing failed, using fallback`);
      // Fallback: merge without AI processing
      sections.push({
        id: `section_${i}`,
        summary: sectionChunks.map(c => c.summary).join(' '),
        actionItems: sectionChunks.flatMap(c => c.actionItems),
        decisions: sectionChunks.flatMap(c => c.decisions),
        questions: sectionChunks.flatMap(c => c.questions),
        startTime: sectionChunks[0]?.startTime || 0,
        endTime: sectionChunks[sectionChunks.length - 1]?.endTime || 0,
        chunkIds: sectionChunks.map(c => c.id)
      });
      continue;
    }
    
    const result = await response.json();
    const cleanedResponse = extractJSONFromResponse(result.completion);
    const parsed = JSON.parse(cleanedResponse);
    
    sections.push({
      id: `section_${i}`,
      summary: parsed.section_summary || sectionChunks.map(c => c.summary).join(' '),
      actionItems: Array.isArray(parsed.action_items) ? parsed.action_items : sectionChunks.flatMap(c => c.actionItems),
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : sectionChunks.flatMap(c => c.decisions),
      questions: Array.isArray(parsed.open_questions) ? parsed.open_questions : sectionChunks.flatMap(c => c.questions),
      startTime: sectionChunks[0]?.startTime || 0,
      endTime: sectionChunks[sectionChunks.length - 1]?.endTime || 0,
      chunkIds: sectionChunks.map(c => c.id)
    });
  }
  
  return sections;
};

// Final refinement (Refine phase)
const refineFinalArtifacts = async (
  sections: SectionSummary[],
  meetingContext: string
): Promise<MeetingArtifacts> => {
  return retryWithBackoff(async () => {
    const systemPrompt = `Produce final meeting artifacts from section summaries. Output strict JSON only.
Schema: {
  "summaries": {
    "executive_120w": "string",
    "detailed_400w": "string",
    "bullet_12": ["string"]
  },
  "action_items": [...],
  "decisions": [...],
  "open_questions": [...]
}
Rules: Executive ≤120 words, Detailed ≤400 words, ≤12 bullets. JSON only.`;
    
    const userPrompt = `Section summaries:\n${sections.map(s => s.summary).join('\n\n')}\n\nMerged action items:\n${JSON.stringify(sections.flatMap(s => s.actionItems))}\n\nMerged decisions:\n${JSON.stringify(sections.flatMap(s => s.decisions))}\n\nMerged questions:\n${JSON.stringify(sections.flatMap(s => s.questions))}`;
    
    const response = await fetch(`${AI_BASE_URL}/text/llm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Final refinement failed (${response.status})`);
    }
    
    const result = await response.json();
    const cleanedResponse = extractJSONFromResponse(result.completion);
    const parsed = JSON.parse(cleanedResponse);
    
    return {
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items : sections.flatMap(s => s.actionItems),
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : sections.flatMap(s => s.decisions),
      open_questions: Array.isArray(parsed.open_questions) ? parsed.open_questions : sections.flatMap(s => s.questions),
      summaries: {
        executive_120w: parsed.summaries?.executive_120w || 'Summary not available',
        detailed_400w: parsed.summaries?.detailed_400w || 'Detailed summary not available',
        bullet_12: Array.isArray(parsed.summaries?.bullet_12) ? parsed.summaries.bullet_12 : ['Summary not available']
      }
    };
  });
};

export const transcribeAudio = async (request: TranscribeRequest): Promise<TranscribeResponse> => {
  return retryWithBackoff(async () => {
    console.log('Starting transcription request...');
    console.log('Audio file info:', request.audio);
    
    // Validate audio file before sending
    if ('size' in request.audio && request.audio.size === 0) {
      throw new Error('Audio file is empty');
    }
    
    const formData = new FormData();
    formData.append('audio', request.audio as any);
    if (request.language) {
      formData.append('language', request.language);
    }

    console.log('Sending transcription request to:', `${AI_BASE_URL}/stt/transcribe/`);
    
    // Add timeout for transcription requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000); // 15 minutes
    
    try {
      const response = await fetch(`${AI_BASE_URL}/stt/transcribe/`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('Transcription response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorText = 'Unknown error';
        try {
          const errorResponse = await response.text();
          errorText = errorResponse;
          
          // Try to parse as JSON to get more detailed error info
          try {
            const errorJson = JSON.parse(errorResponse);
            if (errorJson.error) {
              errorText = errorJson.error;
            } else if (errorJson.message) {
              errorText = errorJson.message;
            }
          } catch {
            // Keep the raw text if it's not JSON
          }
        } catch {
          errorText = 'Unable to read error response';
        }
        
        console.error('Transcription API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        
        throw new Error(`Transcription failed (${response.status}): ${errorText}`);
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('Failed to parse transcription response as JSON:', parseError);
        throw new Error('Invalid transcription response: response is not valid JSON');
      }
      
      // Log the actual response for debugging
      console.log('Transcription API response keys:', Object.keys(result || {}));
      
      // Validate response structure with more detailed error info
      if (!result || typeof result !== 'object') {
        console.error('Invalid response format:', result);
        throw new Error('Invalid transcription response: response is not an object');
      }
      
      // Handle different possible response formats
      let transcriptionText = '';
      let language = 'en';
      
      if (result.text && typeof result.text === 'string') {
        transcriptionText = result.text;
        language = result.language || 'en';
      } else if (result.transcription && typeof result.transcription === 'string') {
        // Alternative response format
        transcriptionText = result.transcription;
        language = result.language || result.detected_language || 'en';
      } else if (result.transcript && typeof result.transcript === 'string') {
        // Another alternative response format
        transcriptionText = result.transcript;
        language = result.language || result.detected_language || 'en';
      } else {
        console.error('No valid text field found in response:', result);
        console.error('Available fields:', Object.keys(result));
        throw new Error('Invalid transcription response: missing or invalid text field');
      }
      
      // Validate transcription text
      const validatedText = validateTranscript(transcriptionText);
      
      return {
        text: validatedText,
        language: language
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Transcription timed out. The audio file may be too long (max 15 minutes). Please try with a shorter recording.');
      }
      throw error;
    }
  });
};

const processActionItems = async (transcript: string, meetingContext: string): Promise<any[]> => {
  return retryWithBackoff(async () => {
    const systemPrompt = `Extract action items from the meeting transcript. Return ONLY a JSON array of objects with this schema:
[{"title": "string", "assignee": "string", "assignee_email": "string or null", "due_date": "string or null", "priority": "High|Medium|Low", "dependencies": [], "status": "Not Started", "source_quote": "string", "confidence": 0.9, "tags": []}]
Only include clear commitments or requests. Infer assignee from "I will..." or "@Name" mentions.
If no action items are found, return an empty array [].
Do not wrap the response in markdown code blocks. Return only valid JSON.`;

    const response = await fetch(`${AI_BASE_URL}/text/llm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${meetingContext}\n\nTranscript:\n${transcript}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Action items processing failed (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    
    try {
      // Extract JSON from potential markdown wrapper
      const cleanedResponse = extractJSONFromResponse(result.completion);
      const parsed = JSON.parse(cleanedResponse);
      
      if (Array.isArray(parsed)) {
        // Ensure each action item has required fields with proper IDs
        return parsed.map((item, index) => ({
          id: `action_${Date.now()}_${index}`,
          title: item.title || 'Untitled Action Item',
          assignee: item.assignee || 'Unassigned',
          assignee_email: item.assignee_email || null,
          due_date: item.due_date || null,
          priority: item.priority || 'Medium',
          dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
          status: item.status || 'Not Started',
          source_quote: item.source_quote || '',
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
          tags: Array.isArray(item.tags) ? item.tags : []
        }));
      }
      return [];
    } catch (parseError) {
      console.error('Failed to parse action items response:', result.completion);
      console.error('Parse error:', parseError);
      return []; // Return empty array if parsing fails
    }
  });
};

const processDecisions = async (transcript: string, meetingContext: string): Promise<any[]> => {
  return retryWithBackoff(async () => {
    const systemPrompt = `Extract decisions from the meeting transcript. Return ONLY a JSON array of objects with this schema:
[{"statement": "string", "rationale": "string or null", "source_quote": "string", "confidence": 0.9, "tags": []}]
If no decisions are found, return an empty array [].
Do not wrap the response in markdown code blocks. Return only valid JSON.`;

    const response = await fetch(`${AI_BASE_URL}/text/llm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${meetingContext}\n\nTranscript:\n${transcript}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Decisions processing failed (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    
    try {
      // Extract JSON from potential markdown wrapper
      const cleanedResponse = extractJSONFromResponse(result.completion);
      const parsed = JSON.parse(cleanedResponse);
      
      if (Array.isArray(parsed)) {
        // Ensure each decision has required fields with proper IDs
        return parsed.map((item, index) => ({
          id: `decision_${Date.now()}_${index}`,
          statement: item.statement || 'Decision not specified',
          rationale: item.rationale || null,
          source_quote: item.source_quote || '',
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
          tags: Array.isArray(item.tags) ? item.tags : []
        }));
      }
      return [];
    } catch (parseError) {
      console.error('Failed to parse decisions response:', result.completion);
      console.error('Parse error:', parseError);
      return []; // Return empty array if parsing fails
    }
  });
};

const processQuestions = async (transcript: string, meetingContext: string): Promise<any[]> => {
  return retryWithBackoff(async () => {
    const systemPrompt = `Extract open questions from the meeting transcript. Return ONLY a JSON array of objects with this schema:
[{"question": "string", "owner": "string or null", "needed_by": "string or null", "source_quote": "string"}]
If no open questions are found, return an empty array [].
Do not wrap the response in markdown code blocks. Return only valid JSON.`;

    const response = await fetch(`${AI_BASE_URL}/text/llm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${meetingContext}\n\nTranscript:\n${transcript}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Questions processing failed (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    
    try {
      // Extract JSON from potential markdown wrapper
      const cleanedResponse = extractJSONFromResponse(result.completion);
      const parsed = JSON.parse(cleanedResponse);
      
      if (Array.isArray(parsed)) {
        // Ensure each question has required fields with proper IDs
        return parsed.map((item, index) => ({
          id: `question_${Date.now()}_${index}`,
          question: item.question || 'Question not specified',
          owner: item.owner || null,
          needed_by: item.needed_by || null,
          source_quote: item.source_quote || ''
        }));
      }
      return [];
    } catch (parseError) {
      console.error('Failed to parse questions response:', result.completion);
      console.error('Parse error:', parseError);
      return []; // Return empty array if parsing fails
    }
  });
};

// Helper function to extract JSON from markdown code blocks
const extractJSONFromResponse = (text: string): string => {
  // Remove markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return text.trim();
};

const processSummaries = async (transcript: string, meetingContext: string): Promise<any> => {
  return retryWithBackoff(async () => {
    const systemPrompt = `Create meeting summaries. Return ONLY a JSON object with this exact schema:
{"executive_120w": "string", "detailed_400w": "string", "bullet_12": ["string"]}
Executive: ≤120 words, Detailed: ≤400 words, Bullet: ≤12 bullet points.
Do not wrap the response in markdown code blocks. Return only valid JSON.`;

    const response = await fetch(`${AI_BASE_URL}/text/llm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${meetingContext}\n\nTranscript:\n${transcript}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Summaries processing failed (${response.status}): ${errorText}`);
    }
    
    const result = await response.json();
    
    try {
      // Extract JSON from potential markdown wrapper
      const cleanedResponse = extractJSONFromResponse(result.completion);
      const parsed = JSON.parse(cleanedResponse);
      
      // Provide fallback values if parsing succeeds but structure is invalid
      return {
        executive_120w: parsed.executive_120w || 'Summary not available',
        detailed_400w: parsed.detailed_400w || 'Detailed summary not available',
        bullet_12: Array.isArray(parsed.bullet_12) ? parsed.bullet_12 : ['Summary not available']
      };
    } catch (parseError) {
      console.error('Failed to parse summaries response:', result.completion);
      console.error('Parse error:', parseError);
      // Return fallback summaries
      return {
        executive_120w: 'Summary generation failed',
        detailed_400w: 'Detailed summary generation failed',
        bullet_12: ['Summary generation failed']
      };
    }
  });
};

export const processTranscript = async (
  request: ProcessTranscriptRequest,
  onProgress?: ProgressCallback
): Promise<MeetingArtifacts> => {
  const meetingContext = `Meeting: ${request.meetingTitle || 'Untitled Meeting'}\nDate: ${request.meetingDate || new Date().toISOString()}\nAttendees: ${request.attendees?.join(', ') || 'Not specified'}`;

  onProgress?.({ stage: 'mapping', progress: 0, message: 'Starting AI analysis...' });

  try {
    // Process sequentially to avoid overwhelming the API
    onProgress?.({ stage: 'mapping', progress: 10, message: 'Extracting action items...' });
    const actionItems = await processActionItems(request.transcript, meetingContext);
    
    onProgress?.({ stage: 'mapping', progress: 35, message: 'Identifying decisions...' });
    const decisions = await processDecisions(request.transcript, meetingContext);
    
    onProgress?.({ stage: 'mapping', progress: 60, message: 'Finding open questions...' });
    const openQuestions = await processQuestions(request.transcript, meetingContext);
    
    onProgress?.({ stage: 'refining', progress: 85, message: 'Generating summaries...' });
    const summaries = await processSummaries(request.transcript, meetingContext);
    
    onProgress?.({ stage: 'refining', progress: 100, message: 'Analysis complete' });

    return {
      action_items: actionItems,
      decisions: decisions,
      open_questions: openQuestions,
      summaries: summaries,
    };
  } catch (error) {
    console.error('Failed to process transcript:', error);
    
    // Return partial results with fallbacks
    return {
      action_items: [],
      decisions: [],
      open_questions: [],
      summaries: {
        executive_120w: 'Analysis failed - please review transcript manually',
        detailed_400w: 'Analysis failed - please review transcript manually',
        bullet_12: ['Analysis failed - please review transcript manually']
      },
    };
  }
};

export const generateEmailDraft = async (
  request: EmailDraftRequest,
  onProgress?: ProgressCallback
): Promise<EmailDraft> => {
  return retryWithBackoff(async () => {
    onProgress?.({ stage: 'generating_email', progress: 0, message: 'Drafting email...' });
    
    const systemPrompt = `You are a professional executive assistant. Create an email note for attendees.
Output format:
{
  "subject": "Notes & next steps — <Meeting Title> — <YYYY-MM-DD>",
  "body_markdown": "<markdown body>",
  "recipients_suggested": ["a@x.com","b@y.com"],
  "cc_suggested": []
}
Rules:
- Be concise, neutral, and factual.
- Use a table for action items: Assignee | Item | Due | Priority | Status.
- Include decisions and open questions sections.
- Never send automatically; the user must approve.
- Ensure the response is valid JSON.`;

    const userPrompt = `Meeting: ${request.meetingTitle}
Date: ${request.meetingDate}
Attendees: ${request.attendees.join(', ')}

Action Items: ${JSON.stringify(request.artifacts.action_items, null, 2)}
Decisions: ${JSON.stringify(request.artifacts.decisions, null, 2)}
Open Questions: ${JSON.stringify(request.artifacts.open_questions, null, 2)}
Summary: ${request.artifacts.summaries.executive_120w}`;

    const response = await fetch(`${AI_BASE_URL}/text/llm/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Email draft generation failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    try {
      // Extract JSON from potential markdown wrapper
      const cleanedResponse = extractJSONFromResponse(result.completion);
      const emailDraft = JSON.parse(cleanedResponse);
      
      // Validate and provide fallbacks
      const validatedDraft: EmailDraft = {
        subject: emailDraft.subject || `Notes & next steps — ${request.meetingTitle} — ${new Date(request.meetingDate).toISOString().split('T')[0]}`,
        body_markdown: emailDraft.body_markdown || 'Email content generation failed',
        recipients_suggested: Array.isArray(emailDraft.recipients_suggested) ? emailDraft.recipients_suggested : [],
        cc_suggested: Array.isArray(emailDraft.cc_suggested) ? emailDraft.cc_suggested : []
      };
      
      onProgress?.({ stage: 'generating_email', progress: 100, message: 'Email draft ready' });
      return validatedDraft;
    } catch (parseError) {
      console.error('Failed to parse email draft response:', result.completion);
      console.error('Parse error:', parseError);
      
      // Return fallback email draft
      const fallbackDraft: EmailDraft = {
        subject: `Notes & next steps — ${request.meetingTitle} — ${new Date(request.meetingDate).toISOString().split('T')[0]}`,
        body_markdown: `# Meeting Notes: ${request.meetingTitle}\n\n**Date:** ${request.meetingDate}\n**Attendees:** ${request.attendees.join(', ')}\n\n*Email generation failed. Please review the meeting artifacts manually.*`,
        recipients_suggested: [],
        cc_suggested: []
      };
      
      onProgress?.({ stage: 'generating_email', progress: 100, message: 'Email draft ready (fallback)' });
      return fallbackDraft;
    }
  });
};

// Improved chunked processing for long meetings with better error handling
export const processFullMeetingStreaming = async (
  audioFile: File | { uri: string; name: string; type: string },
  meetingTitle: string,
  attendees: string[],
  duration: number,
  onProgress?: ProgressCallback
): Promise<{ transcript: string; artifacts: MeetingArtifacts; emailDraft: EmailDraft }> => {
  try {
    const meetingContext = `Meeting: ${meetingTitle}\nDate: ${new Date().toISOString()}\nAttendees: ${attendees.join(', ')}`;
    
    // Step 1: Transcribe full audio with better validation
    onProgress?.({ stage: 'transcribing', progress: 0, message: 'Starting transcription...' });
    console.log('Starting transcription for streaming processing...');
    console.log('Audio file info:', audioFile);
    
    const transcriptResult = await transcribeAudio({ audio: audioFile });
    console.log('Transcription completed, length:', transcriptResult.text.length, 'characters');
    
    // Validate transcript before proceeding
    const validatedTranscript = validateTranscript(transcriptResult.text);
    onProgress?.({ stage: 'transcribing', progress: 100, message: 'Transcription complete' });
    
    // Step 2: Determine processing strategy based on transcript length
    const shouldUseChunking = validatedTranscript.length > MAX_TRANSCRIPT_LENGTH;
    console.log(`Transcript length: ${validatedTranscript.length}, using ${shouldUseChunking ? 'chunked' : 'direct'} processing`);
    
    if (!shouldUseChunking) {
      // Direct processing for shorter transcripts
      console.log('Using direct processing for short transcript');
      const artifacts = await processTranscript({
        transcript: validatedTranscript,
        attendees,
        meetingTitle,
        meetingDate: new Date().toISOString(),
      }, onProgress);
      
      const emailDraft = await generateEmailDraft({
        meetingTitle,
        meetingDate: new Date().toISOString(),
        attendees,
        artifacts,
      }, onProgress);
      
      onProgress?.({ stage: 'completed', progress: 100, message: 'Processing complete!' });
      
      return {
        transcript: validatedTranscript,
        artifacts: { ...artifacts, email_draft: emailDraft },
        emailDraft,
      };
    }
    
    // Step 3: Chunked processing for longer transcripts
    onProgress?.({ stage: 'chunking', progress: 0, message: 'Creating processing chunks...' });
    const transcriptChunks = splitTranscriptIntoChunks(validatedTranscript);
    console.log(`Created ${transcriptChunks.length} chunks for processing`);
    
    onProgress?.({ stage: 'chunking', progress: 100, message: `Created ${transcriptChunks.length} chunks` });
    
    // Step 4: Map phase - Process each chunk with better error handling
    onProgress?.({ stage: 'mapping', progress: 0, message: 'Processing chunks...', totalChunks: transcriptChunks.length });
    const chunkSummaries: ChunkSummary[] = [];
    let successfulChunks = 0;
    
    for (let i = 0; i < transcriptChunks.length; i++) {
      try {
        onProgress?.({ 
          stage: 'mapping', 
          progress: Math.round((i / transcriptChunks.length) * 100), 
          message: `Processing chunk ${i + 1} of ${transcriptChunks.length}`,
          currentChunk: i + 1,
          totalChunks: transcriptChunks.length
        });
        
        const chunkSummary = await processChunk(transcriptChunks[i], meetingContext, `chunk_${i}`);
        chunkSummaries.push(chunkSummary);
        successfulChunks++;
        
        // Delay between chunks to avoid rate limiting
        if (i < transcriptChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.warn(`Failed to process chunk ${i}, using fallback:`, error);
        // Create fallback chunk summary with partial content
        chunkSummaries.push({
          id: `chunk_${i}`,
          summary: transcriptChunks[i].substring(0, 200) + '...',
          actionItems: [],
          decisions: [],
          questions: [],
          startTime: 0,
          endTime: 0
        });
      }
    }
    
    console.log(`Processed ${successfulChunks}/${transcriptChunks.length} chunks successfully`);
    onProgress?.({ stage: 'mapping', progress: 100, message: 'Chunk processing complete' });
    
    // Step 5: Reduce phase - Merge chunks into sections (only if we have multiple chunks)
    let sections: SectionSummary[];
    if (chunkSummaries.length > 1) {
      onProgress?.({ stage: 'reducing', progress: 0, message: 'Merging sections...' });
      sections = await reduceSections(chunkSummaries, meetingContext);
      onProgress?.({ stage: 'reducing', progress: 100, message: 'Section merging complete' });
    } else {
      // Single section for single chunk
      sections = [{
        id: 'section_0',
        summary: chunkSummaries[0]?.summary || 'Processing failed',
        actionItems: chunkSummaries[0]?.actionItems || [],
        decisions: chunkSummaries[0]?.decisions || [],
        questions: chunkSummaries[0]?.questions || [],
        startTime: 0,
        endTime: duration,
        chunkIds: [chunkSummaries[0]?.id || 'chunk_0']
      }];
    }
    
    // Step 6: Refine phase - Create final artifacts
    onProgress?.({ stage: 'refining', progress: 0, message: 'Creating final summary...' });
    const artifacts = await refineFinalArtifacts(sections, meetingContext);
    onProgress?.({ stage: 'refining', progress: 100, message: 'Final summary complete' });
    
    // Step 7: Generate email draft
    const emailDraft = await generateEmailDraft({
      meetingTitle,
      meetingDate: new Date().toISOString(),
      attendees,
      artifacts,
    }, onProgress);

    onProgress?.({ stage: 'completed', progress: 100, message: 'Processing complete!' });

    return {
      transcript: validatedTranscript,
      artifacts: { ...artifacts, email_draft: emailDraft },
      emailDraft,
    };
  } catch (error) {
    console.error('Streaming meeting processing failed:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      if (error.message.includes('Invalid transcription response') || error.message.includes('missing or invalid text field')) {
        throw new Error('Failed to transcribe audio. The audio may be corrupted or the service is unavailable. Please try again.');
      } else if (error.message.includes('Invalid transcript')) {
        throw new Error('The recording appears to be empty or too short. Please try recording again.');
      } else if (error.message.includes('timed out')) {
        throw new Error('Processing timed out. The audio file may be too long. Please try with a shorter recording.');
      } else if (error.message.includes('Transcription')) {
        throw new Error('Failed to transcribe audio. Please check your internet connection and try again.');
      } else if (error.message.includes('Chunk') || error.message.includes('processing')) {
        throw new Error('Failed to analyze the transcript. Please try again or contact support.');
      }
    }
    
    throw new Error('Meeting processing failed. Please try again or contact support if the issue persists.');
  }
};

// Helper function to split transcript into logical chunks with size limits
const splitTranscriptIntoChunks = (transcript: string, targetChunks?: number): string[] => {
  // If transcript is short enough, return as single chunk
  if (transcript.length <= MAX_TRANSCRIPT_LENGTH && !targetChunks) {
    return [transcript];
  }
  
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    // If adding this sentence would exceed chunk size, start new chunk
    if (currentChunk.length > 0 && (currentChunk.length + trimmedSentence.length) > CHUNK_SIZE_LIMIT) {
      chunks.push(currentChunk.trim() + '.');
      currentChunk = trimmedSentence;
    } else {
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    }
  }
  
  // Add the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim() + '.');
  }
  
  return chunks.filter(chunk => chunk.trim().length > 20); // Filter out very short chunks
};

// Helper function to validate and clean transcript
const validateTranscript = (transcript: string): string => {
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('Invalid transcript: must be a non-empty string');
  }
  
  const cleaned = transcript.trim();
  if (cleaned.length === 0) {
    throw new Error('Invalid transcript: transcript is empty');
  }
  
  if (cleaned.length < 10) {
    throw new Error('Invalid transcript: transcript is too short (less than 10 characters)');
  }
  
  return cleaned;
};

// Optimized function for shorter meetings with better error handling
export const processFullMeeting = async (
  audioFile: File | { uri: string; name: string; type: string },
  meetingTitle: string,
  attendees: string[],
  onProgress?: ProgressCallback
): Promise<{ transcript: string; artifacts: MeetingArtifacts; emailDraft: EmailDraft }> => {
  try {
    onProgress?.({ stage: 'transcribing', progress: 0, message: 'Starting transcription...' });

    // Validate audio file before processing
    if ('size' in audioFile && audioFile.size === 0) {
      throw new Error('Audio file is empty or corrupted');
    }
    
    console.log('Starting transcription for audio file:', audioFile);
    const transcriptResult = await transcribeAudio({ audio: audioFile });
    
    // Validate transcript
    const validatedTranscript = validateTranscript(transcriptResult.text);
    
    console.log('Transcription completed, length:', validatedTranscript.length, 'characters');
    onProgress?.({ stage: 'transcribing', progress: 100, message: 'Transcription complete' });

    // Check if we should use chunked processing even for "short" meetings
    if (validatedTranscript.length > MAX_TRANSCRIPT_LENGTH) {
      console.log('Transcript too long for direct processing, switching to chunked processing');
      // Delegate to streaming processing for long transcripts
      return await processFullMeetingStreaming(audioFile, meetingTitle, attendees, 0, onProgress);
    }

    const artifacts = await processTranscript({
      transcript: validatedTranscript,
      attendees,
      meetingTitle,
      meetingDate: new Date().toISOString(),
    }, onProgress);

    console.log('Transcript processing completed');

    const emailDraft = await generateEmailDraft({
      meetingTitle,
      meetingDate: new Date().toISOString(),
      attendees,
      artifacts,
    }, onProgress);

    console.log('Email draft generation completed');
    onProgress?.({ stage: 'completed', progress: 100, message: 'Processing complete!' });

    return {
      transcript: validatedTranscript,
      artifacts: { ...artifacts, email_draft: emailDraft },
      emailDraft,
    };
  } catch (error) {
    console.error('Full meeting processing failed:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      if (error.message.includes('Invalid transcription response') || error.message.includes('missing or invalid text field')) {
        throw new Error('Failed to transcribe audio. The audio may be corrupted or the service is unavailable. Please try again.');
      } else if (error.message.includes('Invalid transcript')) {
        throw new Error('The recording appears to be empty or too short. Please try recording again.');
      } else if (error.message.includes('timed out')) {
        throw new Error('Processing timed out. Please try with a shorter recording.');
      } else if (error.message.includes('Transcription') || error.message.includes('transcribe')) {
        throw new Error('Failed to transcribe audio. Please check your internet connection and try again.');
      } else if (error.message.includes('processing') || error.message.includes('analyze')) {
        throw new Error('Failed to analyze transcript. The transcription was successful but AI analysis failed.');
      } else if (error.message.includes('Email') || error.message.includes('email')) {
        throw new Error('Failed to generate email draft. The analysis was successful but email generation failed.');
      } else if (error.message.includes('empty') || error.message.includes('silent')) {
        throw new Error('The recording appears to be empty or silent. Please try recording again.');
      } else if (error.message.includes('corrupted')) {
        throw new Error('The audio file appears to be corrupted. Please try recording again.');
      }
    }
    
    throw new Error('Meeting processing failed. Please try again or contact support if the issue persists.');
  }
};