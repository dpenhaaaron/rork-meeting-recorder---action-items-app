// Simple WebSocket server for live transcription demo
// This is a mock implementation for demonstration purposes
// In production, you would connect to a real ASR service like OpenAI Realtime API, Deepgram, etc.

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

const wss = new WebSocketServer({ port: 8787 });

console.log('Live transcription WebSocket server running on port 8787');

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  console.log('Client connected to live transcription');
  let segmentId = 0;
  let mockTranscriptTimer: ReturnType<typeof setInterval> | null = null;
  
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
        console.log('Received message:', message);
        
        if (message.type === 'config') {
          console.log('Audio config received:', message);
          
          // Start mock transcription after a short delay
          setTimeout(() => {
            startMockTranscription();
          }, 2000);
        }
        
        if (message.type === 'end') {
          console.log('End of stream received');
          if (mockTranscriptTimer) {
            clearInterval(mockTranscriptTimer);
            mockTranscriptTimer = null;
          }
        }
      } catch {
        console.log('Non-JSON message received');
      }
    } else {
      // Binary audio data received
      console.log('Audio data received:', data.length, 'bytes');
      // In a real implementation, you would forward this to your ASR service
    }
  });
  
  function startMockTranscription() {
    console.log('Starting mock transcription');
    
    mockTranscriptTimer = setInterval(() => {
      if (currentPhraseIndex < mockPhrases.length) {
        const phrase = mockPhrases[currentPhraseIndex];
        
        // Send partial transcript (word by word)
        const words = phrase.split(' ');
        let partialText = '';
        
        words.forEach((word, index) => {
          setTimeout(() => {
            partialText += (index > 0 ? ' ' : '') + word;
            
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'partial',
                text: partialText
              }));
            }
            
            // Send final transcript when phrase is complete
            if (index === words.length - 1) {
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'final',
                    id: `segment_${segmentId++}`,
                    text: phrase,
                    start: Date.now() - phrase.length * 100,
                    end: Date.now()
                  }));
                }
              }, 500);
            }
          }, index * 200); // 200ms delay between words
        });
        
        currentPhraseIndex++;
      } else {
        // Reset for demo purposes
        currentPhraseIndex = 0;
      }
    }, 5000); // New phrase every 5 seconds
  }
  
  ws.on('close', () => {
    console.log('Client disconnected from live transcription');
    if (mockTranscriptTimer) {
      clearInterval(mockTranscriptTimer);
      mockTranscriptTimer = null;
    }
  });
  
  ws.on('error', (error: Error) => {
    console.error('WebSocket error:', error.message);
    if (mockTranscriptTimer) {
      clearInterval(mockTranscriptTimer);
      mockTranscriptTimer = null;
    }
  });
});

export default wss;