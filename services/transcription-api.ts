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
    formData.append('audio', audioFile as any);
  }
  
  if (language) {
    formData.append('language', language);
  }

  console.log('Sending audio to transcription API:', {
    platform: Platform.OS,
    audioType: Platform.OS === 'web' ? (audioFile as File).type : (audioFile as any).type,
    audioSize: Platform.OS === 'web' ? (audioFile as File).size : 'unknown',
    language: language || 'auto-detect'
  });

  try {
    const response = await fetch(STT_API_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Transcription API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Transcription failed: ${response.statusText}`);
    }

    const result: TranscriptionResponse = await response.json();
    
    console.log('Transcription successful:', {
      textLength: result.text.length,
      language: result.language,
      preview: result.text.substring(0, 100)
    });

    return result;
  } catch (error) {
    console.error('Transcription request failed:', error);
    throw error;
  }
}
