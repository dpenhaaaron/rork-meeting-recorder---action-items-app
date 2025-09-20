# Live ASR (Automatic Speech Recognition) Integration

This implementation provides real-time speech transcription during meeting recordings using WebSocket connections.

## Features

- **Real-time transcription**: See words appear as you speak
- **Robust connection handling**: Automatic reconnection and error recovery
- **Cross-platform support**: Works on web (mobile support coming soon)
- **Low latency**: Optimized for minimal delay between speech and text
- **Visual feedback**: Connection status indicators and error messages

## Architecture

### Client Side (`hooks/use-live-transcription.ts`)
- Manages WebSocket connection to transcription server
- Captures audio using Web Audio API (16kHz mono PCM)
- Handles partial and final transcript events
- Provides connection status and error handling

### Server Side (`backend/live-transcription-server.ts`)
- WebSocket server for handling live audio streams
- Mock transcription for demo (replace with real ASR service)
- Heartbeat/ping-pong for connection health
- Handles audio configuration and streaming

### UI Components (`components/LiveASRTranscript.tsx`)
- Displays live transcript with partial and final text
- Shows connection status with visual indicators
- Handles different states (connecting, live, error)

## Usage

### Starting the Live Transcription Server

```bash
# Run the WebSocket server (port 8787)
bun run backend/live-transcription-server.ts
```

### Integration in Recording Flow

The live transcription automatically starts when you begin recording:

1. User starts recording → `startRecording()` called
2. Live transcription WebSocket connects → `liveTranscription.start()`
3. Audio captured and streamed as PCM frames
4. Server processes audio and sends back partial/final transcripts
5. UI updates in real-time with transcribed text
6. User stops recording → `stopRecording()` and `liveTranscription.stop()`

## Configuration

### WebSocket URL
Set the WebSocket server URL in your environment:
```typescript
const LIVE_WS_URL = process.env.EXPO_PUBLIC_LIVE_WS_URL || "ws://localhost:8787"
```

### Audio Settings
- Sample Rate: 16kHz (configurable)
- Encoding: 16-bit PCM Little Endian
- Channels: Mono (1 channel)
- Buffer Size: 2048 samples for low latency

## Production Integration

To connect to a real ASR service, replace the mock server with:

### Option 1: OpenAI Realtime API
```typescript
// Use WebRTC instead of WebSocket for OpenAI
import { RTCPeerConnection } from 'react-native-webrtc';
```

### Option 2: Deepgram Live API
```typescript
// Connect to Deepgram's streaming endpoint
const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";
```

### Option 3: AssemblyAI Realtime
```typescript
// Connect to AssemblyAI's realtime endpoint
const ASSEMBLYAI_URL = "wss://api.assemblyai.com/v2/realtime/ws";
```

## Troubleshooting

### Common Issues

1. **"Connecting..." stuck**
   - Check WebSocket server is running on port 8787
   - Verify network connectivity
   - Check browser console for connection errors

2. **"Connection failed" error**
   - Ensure microphone permissions granted
   - Check if running on HTTPS (required for mic access)
   - Verify WebSocket URL is correct

3. **No audio being sent**
   - Check microphone is working in other apps
   - Verify audio context is created successfully
   - Look for "Audio data received" logs in server

4. **Stalled connection**
   - Server will detect stalls after 8 seconds of no messages
   - Client will show "Connection stalled" error
   - Restart recording to reconnect

### Debug Logs

Enable detailed logging:
```typescript
// Client side
console.log('Live transcription state:', liveTranscript);

// Server side  
console.log('Audio data received:', bytesReceived, 'bytes');
```

## Security Considerations

- Use WSS (secure WebSocket) in production
- Implement authentication tokens for WebSocket connections
- Validate and sanitize all incoming audio data
- Rate limit connections to prevent abuse
- Consider end-to-end encryption for sensitive meetings

## Performance Optimization

- Use AudioWorklet instead of ScriptProcessor for better performance
- Implement Voice Activity Detection (VAD) to reduce bandwidth
- Buffer audio frames during network issues
- Use compression for WebSocket messages (disabled for lower latency)

## Future Enhancements

- [ ] React Native mobile support with native audio capture
- [ ] Multiple language support with language detection
- [ ] Speaker diarization (who said what)
- [ ] Real-time translation
- [ ] Confidence scores and uncertainty indicators
- [ ] Audio quality indicators
- [ ] Offline transcription fallback