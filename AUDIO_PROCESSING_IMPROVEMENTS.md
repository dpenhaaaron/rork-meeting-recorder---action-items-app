# Audio Processing Improvements for Long Recordings

## Overview
This document outlines the comprehensive improvements made to handle long audio recordings (up to 4 hours) reliably across all platforms.

## Key Improvements

### 1. Chunked Upload System (`services/chunked-upload.ts`)
- **5MB chunks** with automatic retry logic (3 retries with exponential backoff)
- **Resumable uploads** - can continue from where it left off if interrupted
- **Platform-specific handling**:
  - Web: Direct blob slicing from IndexedDB
  - Mobile: Sequential chunk reading from file system
- **Progress tracking** with detailed callbacks
- **Automatic cleanup** of completed/failed uploads

### 2. Backend Job Queue (`backend/trpc/routes/processing/job-queue.ts`)
- **Asynchronous processing** - upload completes immediately, processing happens in background
- **Concurrent job management** - max 3 jobs processing simultaneously
- **Automatic retry** on failures
- **Job status tracking** with detailed progress updates
- **Automatic cleanup** of old jobs (24 hours)

### 3. Progress Tracking (`services/progress-tracker.ts`)
- **Polling-based** status updates (every 2 seconds)
- **Automatic cleanup** when job completes or errors
- **Multiple job tracking** support
- **Error handling** with fallback status

### 4. Optimized Audio Configuration (`services/audio-processing.ts`)
- **16kHz mono recording** - optimal for ASR (Automatic Speech Recognition)
- **64kbps bitrate** - balance between quality and file size
- **Platform-specific codecs**:
  - Android: AAC in M4A container
  - iOS: AAC in M4A container (changed from WAV for smaller files)
  - Web: Opus in WebM container
- **File validation** with detailed error messages
- **Size estimation** for upload planning

## Architecture Flow

### Recording Flow
```
1. User starts recording
   ↓
2. Audio captured with optimal settings (16kHz mono, 64kbps)
   ↓
3. Recording saved locally (IndexedDB for web, FileSystem for mobile)
   ↓
4. User stops recording
   ↓
5. File validated (size, duration checks)
```

### Processing Flow (New System)
```
1. User initiates processing
   ↓
2. Check file size → Determine upload strategy
   ↓
3a. Small files (<10MB): Direct upload
3b. Large files (>10MB): Chunked upload
   ↓
4. Upload completes → Job created in queue
   ↓
5. Backend worker picks up job
   ↓
6. Transcription (with progress updates)
   ↓
7. AI Analysis (action items, decisions, summaries)
   ↓
8. Results saved → User notified
```

## Backend Routes

### Upload Routes
- `POST /api/trpc/upload.initiate` - Initialize chunked upload session
- `POST /api/trpc/upload.chunk` - Upload individual chunk
- `POST /api/trpc/upload.finalize` - Complete upload and create processing job
- `GET /api/trpc/upload.status` - Check upload progress

### Processing Routes
- `GET /api/trpc/processing.status` - Check job status and get results

## Configuration Recommendations

### Client-Side
```typescript
// Optimal recording settings
const RECORDING_CONFIG = {
  sampleRate: 16000,      // 16kHz for ASR
  numberOfChannels: 1,     // Mono
  bitRate: 64000,          // 64kbps
};

// Upload settings
const CHUNK_SIZE = 5 * 1024 * 1024;  // 5MB chunks
const MAX_RETRIES = 3;                // Retry failed chunks
const RETRY_DELAY = 2000;             // 2s initial delay
```

### Backend
```typescript
// Job queue settings
const MAX_CONCURRENT_JOBS = 3;        // Process 3 jobs at once
const JOB_TIMEOUT = 30 * 60 * 1000;   // 30 minute timeout
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;  // 24 hours
```

## Error Handling

### Upload Errors
- **Network failures**: Automatic retry with exponential backoff
- **Chunk failures**: Retry individual chunk (not entire upload)
- **Session expiry**: Resume from last successful chunk

### Processing Errors
- **Transcription failures**: Detailed error messages with retry option
- **Timeout**: 30-minute limit per job
- **Memory issues**: Chunked processing for large files

## Performance Optimizations

### 1. Recording
- **Mono audio** reduces file size by 50%
- **16kHz sample rate** reduces file size by 66% vs 44.1kHz
- **64kbps bitrate** optimal for speech (vs 128kbps music quality)
- **Result**: 4-hour recording = ~110MB (vs 500MB+ with old settings)

### 2. Upload
- **Chunked uploads** prevent memory issues
- **Parallel chunk preparation** (read next while uploading current)
- **Resume capability** saves bandwidth on failures

### 3. Processing
- **Async job queue** prevents request timeouts
- **Concurrent processing** improves throughput
- **Chunked transcription** for files >3 minutes

## Testing Recommendations

### Test Cases
1. **Short recording** (< 1 minute) - Direct upload
2. **Medium recording** (3-10 minutes) - Direct upload, streaming processing
3. **Long recording** (10-60 minutes) - Chunked upload, chunked processing
4. **Very long recording** (1-4 hours) - Full chunked pipeline

### Network Conditions
1. **Stable connection** - Verify normal flow
2. **Intermittent connection** - Test retry logic
3. **Connection loss during upload** - Test resume capability
4. **Slow connection** - Verify timeout handling

### Edge Cases
1. **Empty recording** - Proper error message
2. **Corrupted file** - Validation catches it
3. **Extremely large file** - Chunking handles it
4. **Multiple simultaneous uploads** - Queue management

## Migration Notes

### Breaking Changes
- iOS recording now uses M4A instead of WAV (smaller files)
- Processing is now asynchronous (returns job ID immediately)
- Progress tracking requires polling (not real-time)

### Backward Compatibility
- Old recordings still work with existing processing flow
- New system automatically detects file size and chooses strategy
- No changes required to existing UI components

## Monitoring & Observability

### Key Metrics to Track
1. **Upload success rate** by file size
2. **Average upload time** by file size
3. **Processing success rate** by duration
4. **Average processing time** by duration
5. **Retry frequency** and reasons
6. **Job queue depth** and processing time

### Logging
- All chunk uploads logged with size and timing
- Job status changes logged with timestamps
- Errors logged with full context (file size, duration, platform)
- Performance metrics logged for analysis

## Future Enhancements

### Short Term
1. **WebSocket support** for real-time progress (instead of polling)
2. **Background upload** on mobile (iOS URLSession background)
3. **Compression** before upload (reduce bandwidth)

### Long Term
1. **Voice Activity Detection (VAD)** to trim silence
2. **On-device transcription** for offline support
3. **Streaming transcription** during recording
4. **Multi-part upload to S3** for better scalability

## Troubleshooting

### "Upload failed" errors
- Check network connection
- Verify file exists and is not corrupted
- Check available storage space
- Review chunk upload logs for specific failures

### "Processing timeout" errors
- File may be too large (>2 hours)
- Backend may be overloaded (check queue depth)
- Transcription service may be down
- Try splitting into smaller segments

### "Transcription failed" errors
- Audio may be corrupted or empty
- File format may not be supported
- Audio quality may be too low
- Check transcription service logs

## Support

For issues or questions:
1. Check logs for detailed error messages
2. Verify file size and duration are within limits
3. Test with shorter recording first
4. Contact support with job ID and error details
