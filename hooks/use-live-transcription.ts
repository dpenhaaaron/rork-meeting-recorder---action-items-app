import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { createLiveSocket } from "@/utils/live-socket";

export type LiveSegment = {
  id: string;
  text: string;
  start: number;
  end: number;
  isFinal: boolean;
};

type LiveTranscriptionState = {
  connected: boolean;
  partial: string;
  segments: LiveSegment[];
  error?: string;
};

type Options = {
  url: string;
  token?: string;
  sampleRate?: number;
};

export function useLiveTranscription(opts: Options) {
  const {
    url,
    token,
  } = opts;

  const sockRef = useRef<ReturnType<typeof createLiveSocket> | null>(null);
  const audioCtxRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<any>(null);
  const processorRef = useRef<any>(null);
  const lastRxRef = useRef(Date.now());
  const stallCheckRef = useRef<any>(null);

  const [state, setState] = useState<LiveTranscriptionState>({
    connected: false,
    partial: "",
    segments: [],
  });

  const handleMessage = useCallback((data: any) => {
    lastRxRef.current = Date.now();
    
    if (data?.type === "partial") {
      setState(s => ({ ...s, partial: data.text || "" }));
    } else if (data?.type === "final") {
      setState(s => ({
        ...s,
        partial: "",
        segments: [
          ...s.segments,
          {
            id: data.id || Date.now().toString(),
            text: data.text,
            start: data.start ?? 0,
            end: data.end ?? 0,
            isFinal: true,
          },
        ],
      }));
    } else if (data?.type === "pong") {
      // Keep-alive response, do nothing
    }
  }, []);

  const startAudioCapture = useCallback(async () => {
    if (Platform.OS !== "web") {
      console.log('Live transcription not fully supported on native platforms yet');
      setState(s => ({ ...s, error: "Live transcription requires web platform" }));
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      throw new Error('Media devices not available');
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { 
        channelCount: 1, 
        sampleRate: 16000, // Force 16kHz for consistency
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });
    mediaStreamRef.current = stream;
    
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: 16000 });
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    sourceNodeRef.current = source;

    // Use smaller buffer for lower latency
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    processorRef.current = proc;

    proc.onaudioprocess = (e: any) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = floatTo16BitPCM(input);
      sockRef.current?.send(pcm);
    };

    source.connect(proc);
    // Don't connect to destination to avoid echo
    // proc.connect(ctx.destination);
  }, []);

  const start = useCallback(async () => {
    try {
      console.log('Starting live transcription...');
      
      sockRef.current = createLiveSocket({
        url,
        token,
        onOpen: () => {
          console.log('Live socket opened, starting audio capture');
          setState(s => ({ ...s, connected: true, error: undefined }));
          sockRef.current?.send({ type: "config", sampleRate: 16000, encoding: "linear16" });
          startAudioCapture().catch(error => {
            console.error('Failed to start audio capture:', error);
            setState(s => ({ ...s, error: error instanceof Error ? error.message : 'Audio capture failed' }));
          });
        },
        onMessage: handleMessage,
        onError: (e) => {
          console.error('Live socket error:', e);
          setState(s => ({ ...s, error: "Connection failed", connected: false }));
        },
        onClose: () => {
          console.log('Live socket closed');
          setState(s => ({ ...s, connected: false }));
        },
      });

      // Start stall detection (simplified to avoid circular dependency)
      stallCheckRef.current = setInterval(() => {
        if (state.connected && Date.now() - lastRxRef.current > 8000) {
          console.warn('Live transcription stalled, will need manual restart');
          setState(s => ({ ...s, error: "Connection stalled", connected: false }));
        }
      }, 5000);

    } catch (error) {
      console.error('Failed to start live transcription:', error);
      setState(s => ({ ...s, error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }, [url, token, handleMessage, startAudioCapture, state.connected]);

  const stop = useCallback(async () => {
    try {
      console.log('Stopping live transcription...');
      
      // Clear stall detection
      if (stallCheckRef.current) {
        clearInterval(stallCheckRef.current);
        stallCheckRef.current = null;
      }
      
      // Stop audio capture
      if (processorRef.current && sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
          processorRef.current.disconnect();
        } catch (e) {
          console.warn('Error disconnecting audio nodes:', e);
        }
      }
      if (audioCtxRef.current) {
        try {
          await audioCtxRef.current.close();
        } catch (e) {
          console.warn('Error closing audio context:', e);
        }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => {
          try {
            t.stop();
          } catch (e) {
            console.warn('Error stopping media track:', e);
          }
        });
        mediaStreamRef.current = null;
      }

      // Close socket
      if (sockRef.current) {
        sockRef.current.close();
        sockRef.current = null;
      }
      
      setState(s => ({ ...s, connected: false, partial: "" }));
    } catch (error) {
      console.error('Error stopping live transcription:', error);
    }
  }, []);

  const reset = useCallback(() => {
    setState({ connected: false, partial: "", segments: [] });
  }, []);

  return { ...state, start, stop, reset };
}

// Helper function to convert Float32 audio to 16-bit PCM
function floatTo16BitPCM(float32Arr: Float32Array) {
  const out = new ArrayBuffer(float32Arr.length * 2);
  const view = new DataView(out);
  let offset = 0;
  for (let i = 0; i < float32Arr.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Arr[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}