import { Platform } from 'react-native';

const STT_API_URL = 'https://toolkit.rork.com/stt/transcribe/';

export interface TranscriptionResponse {
  text: string;
  language: string;
}

export async function transcribeAudio(
  audioFile: File | { uri: string; name: string; type: string },
  language?: string
): Promise<TranscriptionResponse> {
  const formData = new FormData();
  
  if (Platform.OS === 'web') {
    formData.append('audio', audioFile as File);
  } else {
    formData.append('audio', {
      uri: (audioFile as any).uri,
      name: (audioFile as any).name,
      type: (audioFile as any).type,
    } as any);
  }
  
  if (language) {
    formData.append('language', language);
  }

  const response = await fetch(STT_API_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Transcription failed');
  }

  const result: TranscriptionResponse = await response.json();
  
  console.log('Transcription API response:', JSON.stringify(result, null, 2));
  
  // Handle nested text object structure
  let transcriptionText = result.text;
  
  // Extract text from nested objects if present
  while (transcriptionText && typeof transcriptionText === 'object' && 'text' in transcriptionText) {
    console.log('Found nested text object, extracting...');
    transcriptionText = (transcriptionText as any).text;
  }
  
  // Validate the extracted text
  if (!transcriptionText || typeof transcriptionText !== 'string' || transcriptionText.trim().length === 0) {
    console.error('Invalid transcription response:', {
      hasText: !!result.text,
      textType: typeof result.text,
      textValue: result.text,
      extractedText: transcriptionText,
      extractedType: typeof transcriptionText
    });
    throw new Error('Transcription returned empty or invalid result. Please try recording again with clear speech.');
  }
  
  return {
    text: transcriptionText.trim(),
    language: result.language || 'en'
  };
}
