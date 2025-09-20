import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

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
    sampleRate = 16000,
  } = opts;

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<any>(null);
  const processorRef = useRef<any>(null);

  const [state, setState] = useState<LiveTranscriptionState>({
    connected: false,
    partial: "",
    segments: [],
  });

  const handleWsMessage = useCallback((msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === "partial") {
        setState(s => ({ ...s, partial: data.text || "" }));
      } else if (data.type === "final") {
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
      }
    } catch (e) {
      console.warn('Failed to parse WebSocket message:', e);
    }
  }, []);

  const start = useCallback(async () => {
    try {
      console.log('Starting live transcription...');
      
      // 1) Open websocket
      const ws = new WebSocket(url, token ? [token] : undefined as any);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setState(s => ({ ...s, connected: true, error: undefined }));
        ws.send(JSON.stringify({ type: "config", sampleRate }));
      };

      ws.onerror = (e: any) => {
        console.error('WebSocket error:', e);
        setState(s => ({ ...s, error: "WebSocket connection failed" }));
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setState(s => ({ ...s, connected: false }));
      };

      ws.onmessage = handleWsMessage;

      // 2) Capture mic and stream frames
      if (Platform.OS === "web") {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
          throw new Error('Media devices not available');
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { 
            channelCount: 1, 
            sampleRate,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        mediaStreamRef.current = stream;
        
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx({ sampleRate });
        audioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        sourceNodeRef.current = source;

        // Use ScriptProcessor for wider compatibility
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = proc;

        proc.onaudioprocess = (e: any) => {
          const input = e.inputBuffer.getChannelData(0);
          const pcm = floatTo16BitPCM(input);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(pcm);
          }
        };

        source.connect(proc);
        proc.connect(ctx.destination);

      } else {
        // For React Native, we'll use a mock implementation
        // In a real app, you'd use a native module for PCM audio capture
        console.log('Live transcription not fully supported on native platforms yet');
        setState(s => ({ ...s, error: "Live transcription requires web platform" }));
      }
    } catch (error) {
      console.error('Failed to start live transcription:', error);
      setState(s => ({ ...s, error: error instanceof Error ? error.message : 'Unknown error' }));
    }
  }, [url, token, sampleRate, handleWsMessage]);

  const stop = useCallback(async () => {
    try {
      console.log('Stopping live transcription...');
      
      // Stop audio capture
      if (processorRef.current && sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        processorRef.current.disconnect();
      }
      if (audioCtxRef.current) {
        await audioCtxRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }

      // Signal end of stream and close WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "end" }));
        wsRef.current.close();
      }
      wsRef.current = null;
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