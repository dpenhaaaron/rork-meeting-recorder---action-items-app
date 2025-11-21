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
  return result;
}
