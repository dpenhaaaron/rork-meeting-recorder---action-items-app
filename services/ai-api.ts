import { MeetingArtifacts, EmailDraft } from '@/types/meeting';

const AI_BASE_URL = 'https://toolkit.rork.com';
const MAX_RETRIES = 2;
const RETRY_DELAY = 2000;
const MAX_TRANSCRIPT_LENGTH = 12000; // Process most meetings directly
const CHUNK_SIZE_LIMIT = 2000; // Optimized chunk size
const CHUNK_DELAY = 100; // Delay between chunk processing in ms

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

// Helper function to extract JSON from markdown code blocks
const extractJSONFromResponse = (text: string): string => {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return text.trim();
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

// Helper function to split transcript into logical chunks
const splitTranscriptIntoChunks = (transcript: string): string[] => {
  if (transcript.length <= MAX_TRANSCRIPT_LENGTH) {
    return [transcript];
  }
  
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    if (currentChunk.length > 0 && (currentChunk.length + trimmedSentence.length) > CHUNK_SIZE_LIMIT) {
      chunks.push(currentChunk.trim() + '.');
      currentChunk = trimmedSentence;
    } else {
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim() + '.');
  }
  
  return chunks.filter(chunk => chunk.trim().length > 20);
};

export const transcribeAudio = async (request: TranscribeRequest): Promise<TranscribeResponse> => {
  return retryWithBackoff(async () => {
    console.log('Starting transcription request...');
    console.log('Audio file info:', request.audio);
    
    // Enhanced validation for audio file
    if ('size' in request.audio) {
      if (request.audio.size === 0) {
        throw new Error('Audio file is empty (0 bytes)');
      }
      if (request.audio.size < 1000) { // Less than 1KB
        throw new Error('Audio file is too small (less than 1KB)');
      }
      console.log('Web audio file size:', request.audio.size, 'bytes');
    }
    
    // Enhanced validation for mobile files
    if ('uri' in request.audio) {
      // Check for empty or invalid URI
      if (!request.audio.uri || typeof request.audio.uri !== 'string') {
        throw new Error('Audio file URI is missing or invalid');
      }
      
      const trimmedUri = request.audio.uri.trim();
      if (trimmedUri === '' || trimmedUri === 'undefined' || trimmedUri === 'null') {
        throw new Error('Audio file URI is empty or invalid: "' + request.audio.uri + '"');
      }
      
      if (!request.audio.name || request.audio.name.trim() === '') {
        throw new Error('Audio file name is missing');
      }
      if (!request.audio.type || request.audio.type.trim() === '') {
        throw new Error('Audio file type is missing');
      }
      console.log('Mobile audio file details:', {
        uri: request.audio.uri,
        name: request.audio.name,
        type: request.audio.type
      });
    }
    
    const formData = new FormData();
    
    try {
      // Handle different audio formats properly
      if ('uri' in request.audio) {
        // Mobile platform - properly format the file object
        const audioFile = {
          uri: request.audio.uri,
          name: request.audio.name,
          type: request.audio.type
        } as any;
        
        console.log('Preparing mobile audio file for upload:', audioFile);
        formData.append('audio', audioFile);
      } else {
        // Web platform - File object
        console.log('Preparing web audio file for upload:', {
          name: request.audio.name,
          size: request.audio.size,
          type: request.audio.type
        });
        formData.append('audio', request.audio as File);
      }
      
      if (request.language) {
        formData.append('language', request.language);
        console.log('Language specified:', request.language);
      }
    } catch (formError) {
      console.error('Failed to prepare FormData:', formError);
      throw new Error('Failed to prepare audio file for upload');
    }

    console.log('Sending transcription request to:', `${AI_BASE_URL}/stt/transcribe/`);
    
    // Add timeout for transcription requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('Transcription request timed out after 15 minutes');
      controller.abort();
    }, 15 * 60 * 1000); // 15 minutes
    
    try {
      const response = await fetch(`${AI_BASE_URL}/stt/transcribe/`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('Transcription response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        let errorText = 'Unknown error';
        let errorDetails = '';
        
        try {
          const errorResponse = await response.text();
          errorText = errorResponse;
          errorDetails = errorResponse;
          
          // Try to parse as JSON to get more detailed error info
          try {
            const errorJson = JSON.parse(errorResponse);
            if (errorJson.error) {
              errorText = errorJson.error;
            } else if (errorJson.message) {
              errorText = errorJson.message;
            } else if (errorJson.detail) {
              errorText = errorJson.detail;
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
          error: errorText,
          fullResponse: errorDetails
        });
        
        // Provide more specific error messages
        if (response.status === 400) {
          throw new Error(`Invalid audio file format or corrupted file: ${errorText}`);
        } else if (response.status === 413) {
          throw new Error('Audio file is too large. Maximum size is 25MB.');
        } else if (response.status === 415) {
          throw new Error('Unsupported audio format. Please use MP3, WAV, M4A, or WebM.');
        } else if (response.status >= 500) {
          throw new Error('Transcription service is temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`Transcription failed (${response.status}): ${errorText}`);
        }
      }

      let result;
      try {
        const responseText = await response.text();
        console.log('Raw transcription response:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse transcription response as JSON:', parseError);
        throw new Error('Invalid transcription response: server returned invalid JSON');
      }
      
      // Log the actual response structure for debugging
      console.log('Transcription API response structure:', {
        keys: Object.keys(result || {}),
        hasText: 'text' in (result || {}),
        hasTranscription: 'transcription' in (result || {}),
        hasTranscript: 'transcript' in (result || {})
      });
      
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
        console.log('Found transcription in "text" field');
      } else if (result.transcription && typeof result.transcription === 'string') {
        // Alternative response format
        transcriptionText = result.transcription;
        language = result.language || result.detected_language || 'en';
        console.log('Found transcription in "transcription" field');
      } else if (result.transcript && typeof result.transcript === 'string') {
        // Another alternative response format
        transcriptionText = result.transcript;
        language = result.language || result.detected_language || 'en';
        console.log('Found transcription in "transcript" field');
      } else {
        console.error('No valid text field found in response:', result);
        console.error('Available fields:', Object.keys(result));
        console.error('Field types:', Object.keys(result).map(key => `${key}: ${typeof result[key]}`));
        throw new Error('Invalid transcription response: no valid text field found. Available fields: ' + Object.keys(result).join(', '));
      }
      
      console.log('Transcription extracted:', {
        length: transcriptionText.length,
        language: language,
        preview: transcriptionText.substring(0, 100) + (transcriptionText.length > 100 ? '...' : '')
      });
      
      // Validate transcription text
      const validatedText = validateTranscript(transcriptionText);
      
      return {
        text: validatedText,
        language: language
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Transcription timed out after 15 minutes. Please try with a shorter recording.');
        }
        if (error.message.includes('Failed to fetch') || error.message.includes('Network request failed')) {
          throw new Error('Network error: Please check your internet connection and try again.');
        }
      }
      
      console.error('Transcription request failed:', error);
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

// Simplified processing for long meetings
export const processFullMeetingStreaming = async (
  audioFile: File | { uri: string; name: string; type: string },
  meetingTitle: string,
  attendees: string[],
  duration: number,
  onProgress?: ProgressCallback
): Promise<{ transcript: string; artifacts: MeetingArtifacts; emailDraft: EmailDraft }> => {
  try {
    onProgress?.({ stage: 'transcribing', progress: 0, message: 'Starting transcription...' });
    console.log('Starting transcription for long meeting...');
    
    const transcriptResult = await transcribeAudio({ audio: audioFile });
    const validatedTranscript = validateTranscript(transcriptResult.text);
    
    onProgress?.({ stage: 'transcribing', progress: 100, message: 'Transcription complete' });
    console.log('Transcription completed, length:', validatedTranscript.length, 'characters');
    
    // For very long transcripts, use chunked processing
    if (validatedTranscript.length > MAX_TRANSCRIPT_LENGTH) {
      onProgress?.({ stage: 'chunking', progress: 0, message: 'Processing in chunks...' });
      
      const chunks = splitTranscriptIntoChunks(validatedTranscript);
      console.log(`Processing ${chunks.length} chunks`);
      
      // Process chunks sequentially with controlled delay
      const chunkResults = [];
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        onProgress?.({
          stage: 'chunking',
          progress: Math.round((index / chunks.length) * 100),
          message: `Processing chunk ${index + 1} of ${chunks.length}...`,
          currentChunk: index + 1,
          totalChunks: chunks.length
        });
        
        try {
          // Add delay between chunks to avoid overwhelming the API
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
          }
          
          const result = await processTranscript({
            transcript: chunk,
            attendees,
            meetingTitle,
            meetingDate: new Date().toISOString(),
          });
          chunkResults.push(result);
        } catch (error) {
          console.warn(`Chunk ${index} failed, using fallback`);
          chunkResults.push({
            action_items: [],
            decisions: [],
            open_questions: [],
            summaries: {
              executive_120w: 'Chunk processing failed',
              detailed_400w: 'Chunk processing failed',
              bullet_12: ['Chunk processing failed']
            }
          });
        }
      }
      
      // Merge results
      const artifacts: MeetingArtifacts = {
        action_items: chunkResults.flatMap(r => r.action_items),
        decisions: chunkResults.flatMap(r => r.decisions),
        open_questions: chunkResults.flatMap(r => r.open_questions),
        summaries: {
          executive_120w: chunkResults.map(r => r.summaries.executive_120w).join(' ').substring(0, 120),
          detailed_400w: chunkResults.map(r => r.summaries.detailed_400w).join(' ').substring(0, 400),
          bullet_12: chunkResults.flatMap(r => r.summaries.bullet_12).slice(0, 12)
        }
      };
      
      onProgress?.({ stage: 'generating_email', progress: 90, message: 'Generating email draft...' });
      
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
    
    // Direct processing for shorter transcripts
    return await processFullMeeting(audioFile, meetingTitle, attendees, onProgress);
    
  } catch (error) {
    console.error('Streaming meeting processing failed:', error);
    throw new Error('Meeting processing failed. Please try again.');
  }
};



// Optimized function for standard meetings
export const processFullMeeting = async (
  audioFile: File | { uri: string; name: string; type: string },
  meetingTitle: string,
  attendees: string[],
  onProgress?: ProgressCallback
): Promise<{ transcript: string; artifacts: MeetingArtifacts; emailDraft: EmailDraft }> => {
  try {
    onProgress?.({ stage: 'transcribing', progress: 0, message: 'Starting transcription...' });

    if ('size' in audioFile && audioFile.size === 0) {
      throw new Error('Audio file is empty or corrupted');
    }
    
    console.log('Starting transcription for audio file');
    const transcriptResult = await transcribeAudio({ audio: audioFile });
    const validatedTranscript = validateTranscript(transcriptResult.text);
    
    console.log('Transcription completed, length:', validatedTranscript.length, 'characters');
    onProgress?.({ stage: 'transcribing', progress: 100, message: 'Transcription complete' });

    if (validatedTranscript.length > MAX_TRANSCRIPT_LENGTH) {
      console.log('Transcript too long, using streaming processing');
      return await processFullMeetingStreaming(audioFile, meetingTitle, attendees, 0, onProgress);
    }

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
  } catch (error) {
    console.error('Meeting processing failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Invalid transcript')) {
        throw new Error('The recording appears to be empty or too short. Please try recording again.');
      } else if (error.message.includes('transcribe')) {
        throw new Error('Failed to transcribe audio. Please check your internet connection and try again.');
      }
    }
    
    throw new Error('Meeting processing failed. Please try again.');
  }
};