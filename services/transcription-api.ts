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
      
      if (response.status === 413) {
        throw new Error('Audio file is too large for transcription. Maximum size is 25MB.');
      } else if (response.status === 400) {
        throw new Error('Invalid audio format. Please ensure you are recording with a supported format.');
      } else if (response.status >= 500) {
        throw new Error('Transcription service is temporarily unavailable. Please try again later.');
      }
      
      throw new Error(`Transcription failed: ${response.statusText}`);
    }

    const result: TranscriptionResponse = await response.json();
    
    console.log('Transcription successful:', {
      textLength: result?.text?.length || 0,
      language: result?.language || 'unknown',
      preview: result?.text?.substring(0, 100) || ''
    });
    
    // Validate response
    if (!result || typeof result.text !== 'string') {
      console.error('Invalid transcription response:', result);
      throw new Error('Invalid transcription response from server');
    }

    return result;
  } catch (error: any) {
    console.error('Transcription request failed:', error);
    
    // If it's already a custom error, rethrow it
    if (error?.message?.includes('too large') || 
        error?.message?.includes('Invalid audio') || 
        error?.message?.includes('temporarily unavailable')) {
      throw error;
    }
    
    // Network errors
    if (error?.message?.includes('Failed to fetch') || error?.name === 'NetworkError') {
      throw new Error('Network error. Please check your internet connection and try again.');
    }
    
    throw error;
  }
}
