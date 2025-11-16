import { Platform } from 'react-native';
import { Audio } from 'expo-av';

export const OPTIMAL_RECORDING_CONFIG = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  web: {
    mimeType: 'audio/webm;codecs=opus',
    bitsPerSecond: 32000,
  },
};

export function getOptimalRecordingConfig() {
  return {
    android: OPTIMAL_RECORDING_CONFIG.android,
    ios: OPTIMAL_RECORDING_CONFIG.ios,
  };
}

export function getWebMediaRecorderConfig(): MediaRecorderOptions {
  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  for (const mimeType of mimeTypes) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
      return {
        mimeType,
        audioBitsPerSecond: 32000,
      };
    }
  }

  return {
    audioBitsPerSecond: 32000,
  };
}

export function estimateAudioSize(durationSeconds: number, bitRate: number = 32000): number {
  return Math.ceil((durationSeconds * bitRate) / 8);
}

export function shouldUseChunkedUpload(fileSizeBytes: number): boolean {
  const CHUNK_THRESHOLD = 8 * 1024 * 1024;
  return fileSizeBytes > CHUNK_THRESHOLD;
}

export function shouldSplitForTranscription(fileSizeBytes: number, durationSeconds: number): boolean {
  const MAX_TRANSCRIPTION_SIZE = 8 * 1024 * 1024;
  const MAX_TRANSCRIPTION_DURATION = 180;
  return fileSizeBytes > MAX_TRANSCRIPTION_SIZE || durationSeconds > MAX_TRANSCRIPTION_DURATION;
}

export function validateAudioFile(fileSize: number, duration: number): { valid: boolean; error?: string } {
  if (fileSize === 0) {
    return { valid: false, error: 'Audio file is empty (0 bytes)' };
  }

  if (duration < 1) {
    return { valid: false, error: 'Recording is too short (less than 1 second)' };
  }

  const expectedMinSize = (duration * 8000) / 8;
  if (fileSize < expectedMinSize) {
    return { 
      valid: false, 
      error: `Audio file is too small (${fileSize} bytes for ${duration}s recording). The recording may be corrupted.` 
    };
  }

  const MAX_FILE_SIZE = 500 * 1024 * 1024;
  if (fileSize > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `Audio file is too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum size is 500MB.` 
    };
  }

  return { valid: true };
}

export async function prepareAudioForUpload(
  audioUri: string,
  platform: typeof Platform.OS
): Promise<{ uri: string; mimeType: string; size: number }> {
  if (platform === 'web') {
    return {
      uri: audioUri,
      mimeType: 'audio/webm',
      size: 0,
    };
  }

  const extension = audioUri.split('.').pop()?.toLowerCase();
  let mimeType = 'audio/m4a';

  if (extension === 'wav') {
    mimeType = 'audio/wav';
  } else if (extension === 'webm') {
    mimeType = 'audio/webm';
  } else if (extension === 'mp3') {
    mimeType = 'audio/mpeg';
  }

  return {
    uri: audioUri,
    mimeType,
    size: 0,
  };
}
