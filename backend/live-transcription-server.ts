// Robust WebSocket server for live transcription demo
// This is a mock implementation for demonstration purposes
// In production, you would connect to a real ASR service like OpenAI Realtime API, Deepgram, etc.

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

const wss = new WebSocketServer({ 
  port: 8787,
  perMessageDeflate: false, // Disable compression for lower latency
});

console.log('Live transcription WebSocket server running on port 8787');

// Heartbeat function to keep connections alive
function heartbeat(this: WebSocket & { isAlive?: boolean }) {
  this.isAlive = true;
}

// Ping all clients every 15 seconds to keep connections alive
const interval = setInterval(() => {
  wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
    if (ws.isAlive === false) {
      console.log('Terminating stale connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

wss.on('close', () => {
  clearInterval(interval);
});

wss.on('connection', (ws: WebSocket & { isAlive?: boolean }, req: IncomingMessage) => {
  console.log('Client connected to live transcription from:', req.socket.remoteAddress);
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  
  let segmentId = 0;
  let mockTranscriptTimer: ReturnType<typeof setInterval> | null = null;
  let audioConfig: { sampleRate?: number; encoding?: string } | null = null;
  
  // Mock transcription phrases for demo
  const mockPhrases = [
    "Hello everyone, welcome to today's meeting.",
    "Let's start by reviewing the agenda.",
    "First item is the quarterly review.",
    "We've seen significant growth this quarter.",
    "Our revenue increased by 25% compared to last quarter.",
    "The marketing campaign was very successful.",
    "We need to discuss the upcoming product launch.",
    "The development team has made great progress.",
    "We should allocate more resources to this project.",
    "Let's move on to the next agenda item.",
    "Does anyone have questions about this topic?",
    "Thank you for your attention today.",
  ];
  
  let currentPhraseIndex = 0;
  
  ws.on('message', (data: Buffer, isBinary: boolean) => {
    if (!isBinary) {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message:', message.type);
        
        if (message.type === 'config') {
          audioConfig = {
            sampleRate: message.sampleRate || 16000,
            encoding: message.encoding || 'linear16'
          };
          console.log('Audio config received:', audioConfig);
          
          // Send acknowledgment
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'config_ack', config: audioConfig }));
          }
          
          // Start mock transcription after a short delay
          setTimeout(() => {
            startMockTranscription();
          }, 1000);
        }
        
        if (message.type === 'ping') {
          // Respond to client ping
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
          }
        }
        
        if (message.type === 'end') {
          console.log('End of stream received');
          if (mockTranscriptTimer) {
            clearInterval(mockTranscriptTimer);
            mockTranscriptTimer = null;
          }
        }
      } catch (error) {
        console.warn('Failed to parse message:', error);
      }
    } else {
      // Binary audio data received
      const bytesReceived = data.length;
      if (bytesReceived > 0) {
        console.log(`Audio data received: ${bytesReceived} bytes (${audioConfig?.sampleRate}Hz ${audioConfig?.encoding})`);
        // In a real implementation, you would forward this to your ASR service
        // For now, we just acknowledge receipt
      }
    }
  });
  
  function startMockTranscription() {
    console.log('Starting mock transcription with config:', audioConfig);
    
    mockTranscriptTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.log('WebSocket closed, stopping mock transcription');
        if (mockTranscriptTimer) {
          clearInterval(mockTranscriptTimer);
          mockTranscriptTimer = null;
        }
        return;
      }
      
      if (currentPhraseIndex < mockPhrases.length) {
        const phrase = mockPhrases[currentPhraseIndex];
        
        // Send partial transcript (word by word)
        const words = phrase.split(' ');
        let partialText = '';
        
        words.forEach((word, index) => {
          setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            
            partialText += (index > 0 ? ' ' : '') + word;
            
            try {
              ws.send(JSON.stringify({
                type: 'partial',
                text: partialText,
                confidence: 0.8 + Math.random() * 0.2 // Mock confidence
              }));
            } catch (error) {
              console.error('Failed to send partial:', error);
            }
            
            // Send final transcript when phrase is complete
            if (index === words.length - 1) {
              setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) return;
                
                try {
                  ws.send(JSON.stringify({
                    type: 'final',
                    id: `segment_${segmentId++}`,
                    text: phrase,
                    start: Date.now() - phrase.length * 100,
                    end: Date.now(),
                    confidence: 0.9 + Math.random() * 0.1
                  }));
                } catch (error) {
                  console.error('Failed to send final:', error);
                }
              }, 300);
            }
          }, index * 150); // 150ms delay between words for more natural flow
        });
        
        currentPhraseIndex++;
      } else {
        // Reset for demo purposes
        currentPhraseIndex = 0;
      }
    }, 4000); // New phrase every 4 seconds
  }
  
  ws.on('close', (code: number, reason: Buffer) => {
    console.log(`Client disconnected from live transcription: ${code} ${reason.toString()}`);
    if (mockTranscriptTimer) {
      clearInterval(mockTranscriptTimer);
      mockTranscriptTimer = null;
    }
  });
  
  ws.on('error', (error: Error) => {
    console.error('WebSocket error for client:', error.message);
    if (mockTranscriptTimer) {
      clearInterval(mockTranscriptTimer);
      mockTranscriptTimer = null;
    }
  });
  
  // Send initial ready message
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'ready', 
        message: 'Live transcription server ready',
        timestamp: Date.now()
      }));
    }
  }, 100);
});

export default wss;