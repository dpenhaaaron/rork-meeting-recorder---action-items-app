import { Platform } from 'react-native';

const MAX_RECORDING_DURATION = 10 * 60;

export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

export interface OnDeviceTranscriber {
  start: () => void;
  stop: () => string;
  isSupported: () => boolean;
  isListening: boolean;
}

class WebSpeechRecognition implements OnDeviceTranscriber {
  private recognition: any = null;
  private transcript: string = '';
  private onResultCallback?: (result: TranscriptionResult) => void;
  isListening: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;
    }
  }

  isSupported(): boolean {
    return this.recognition !== null;
  }

  setOnResult(callback: (result: TranscriptionResult) => void) {
    this.onResultCallback = callback;
  }

  start() {
    if (!this.recognition) {
      throw new Error('Speech recognition not supported');
    }

    this.transcript = '';
    this.isListening = true;

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          this.transcript += transcript + ' ';
          
          this.onResultCallback?.({
            text: this.transcript.trim(),
            isFinal: true,
            confidence: confidence || 0.9,
          });
        } else {
          interimTranscript += transcript;
          
          this.onResultCallback?.({
            text: this.transcript.trim() + ' ' + interimTranscript,
            isFinal: false,
            confidence: confidence || 0.5,
          });
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        console.log('No speech detected, continuing...');
      } else if (event.error === 'aborted') {
        console.log('Speech recognition aborted');
      } else {
        console.error('Speech recognition error:', event.error);
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (error) {
          console.error('Failed to restart recognition:', error);
          this.isListening = false;
        }
      }
    };

    try {
      this.recognition.start();
      console.log('Web speech recognition started');
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      throw error;
    }
  }

  stop(): string {
    this.isListening = false;
    
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.warn('Error stopping recognition:', error);
      }
    }

    const finalTranscript = this.transcript.trim();
    this.transcript = '';
    
    return finalTranscript;
  }
}

class MobileSpeechRecognition implements OnDeviceTranscriber {
  private transcript: string = '';
  isListening: boolean = false;

  isSupported(): boolean {
    return false;
  }

  start() {
    throw new Error('On-device speech recognition is not available on mobile. Please use web browser for this feature.');
  }

  stop(): string {
    return this.transcript;
  }
}

export function createTranscriber(): OnDeviceTranscriber {
  if (Platform.OS === 'web') {
    return new WebSpeechRecognition();
  } else {
    return new MobileSpeechRecognition();
  }
}

export function getMaxRecordingDuration(): number {
  return MAX_RECORDING_DURATION;
}
