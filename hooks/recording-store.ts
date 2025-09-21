import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Meeting, RecordingState, MeetingArtifacts } from '@/types/meeting';
import { processFullMeeting, processFullMeetingStreaming, ProcessingProgress } from '@/services/ai-api';


const RECORDINGS_DIR = `${FileSystem.documentDirectory}recordings/`;
const MAX_RECORDING_DURATION = 30 * 60; // 30 minutes in seconds

export const [RecordingProvider, useRecording] = createContextHook(() => {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioLevels: [],
  });
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [consentGiven, setConsentGiven] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState(false);
  

  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRecordingRef = useRef<(() => Promise<string | null>) | null>(null);
  
  const storeAudioBlob = useCallback(async (meetingId: string, blob: Blob) => {
    if (Platform.OS !== 'web') return;
    
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('MeetingRecorderDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['audioFiles'], 'readwrite');
        const store = transaction.objectStore('audioFiles');
        
        const putRequest = store.put({ id: meetingId, blob, timestamp: Date.now() });
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('audioFiles')) {
          db.createObjectStore('audioFiles', { keyPath: 'id' });
        }
      };
    });
  }, []);

  const getAudioBlob = useCallback(async (meetingId: string): Promise<Blob | null> => {
    if (Platform.OS !== 'web') return null;
    
    return new Promise<Blob | null>((resolve, reject) => {
      const request = indexedDB.open('MeetingRecorderDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['audioFiles'], 'readonly');
        const store = transaction.objectStore('audioFiles');
        
        const getRequest = store.get(meetingId);
        getRequest.onsuccess = () => {
          const result = getRequest.result;
          resolve(result ? result.blob : null);
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  }, []);

  const deleteAudioBlob = useCallback(async (meetingId: string) => {
    if (Platform.OS !== 'web') return;
    
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('MeetingRecorderDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['audioFiles'], 'readwrite');
        const store = transaction.objectStore('audioFiles');
        
        const deleteRequest = store.delete(meetingId);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      };
    });
  }, []);

  const setupAudio = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Audio permission not granted');
          return;
        }
        
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        
        const dirInfo = await FileSystem.getInfoAsync(RECORDINGS_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
        }
      }
    } catch (error) {
      console.error('Failed to setup audio:', error);
    }
  }, []);

  const loadMeetings = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('meetings');
      if (stored) {
        setMeetings(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load meetings:', error);
    }
  }, []);

  const saveMeetings = useCallback(async (updatedMeetings: Meeting[]) => {
    try {
      await AsyncStorage.setItem('meetings', JSON.stringify(updatedMeetings));
      setMeetings(updatedMeetings);
    } catch (error) {
      console.error('Failed to save meetings:', error);
    }
  }, []);

  const finishStopRecording = useCallback(async (audioUri: string | null, resolve?: (value: string | null) => void): Promise<string | null> => {
    try {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      if (state.currentMeeting) {
        console.log('Finishing recording for meeting:', state.currentMeeting.id);
        
        const shouldProcess = state.duration > 0 && audioUri !== null;
        
        const updatedMeeting: Meeting = {
          ...state.currentMeeting,
          duration: state.duration,
          audioUri: audioUri ?? state.currentMeeting.audioUri,
          status: shouldProcess ? 'processing' : 'error',
          artifacts: state.currentMeeting.artifacts,
        };

        try {
          const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
          const updatedMeetings = currentMeetings.map((m: Meeting) => 
            m.id === updatedMeeting.id ? updatedMeeting : m
          );
          await saveMeetings(updatedMeetings);
        } catch (storageError) {
          console.error('Failed to save meeting to storage:', storageError);
        }

        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          duration: 0,
          currentMeeting: undefined,
        }));
        


        const meetingId = updatedMeeting.id;
        if (resolve) {
          resolve(meetingId);
        }
        return meetingId;
      }

      if (resolve) {
        resolve(null);
      }
      return null;
    } catch (error) {
      console.error('Failed to finish stop recording:', error);
      
      // Ensure state is reset even on error
      setState(prev => ({
        ...prev,
        isRecording: false,
        isPaused: false,
        duration: 0,
        currentMeeting: undefined,
      }));
      

      
      if (resolve) {
        resolve(null);
      }
      return null;
    }
  }, [state.currentMeeting, state.duration, saveMeetings]);

  const startRecording = useCallback(async (title: string, attendees: string[] = []) => {
    if (!consentGiven) {
      throw new Error('Recording consent required');
    }

    try {
      // Clean up any existing recording first
      if (state.isRecording) {
        console.warn('Recording already in progress, cleaning up...');
        
        // Force cleanup without calling stopRecording to avoid circular dependency
        if (durationInterval.current) {
          clearInterval(durationInterval.current);
          durationInterval.current = null;
        }
        
        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          duration: 0,
          currentMeeting: undefined,
        }));
      }

      const meetingId = Date.now().toString();
      const newMeeting: Meeting = {
        id: meetingId,
        title,
        date: new Date().toISOString(),
        duration: 0,
        attendees: attendees.map(name => ({ name })),
        status: 'recording',
      };

      if (Platform.OS === 'web') {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
          throw new Error('Microphone is not available in this environment');
        }
        if (typeof window === 'undefined' || !("MediaRecorder" in window)) {
          throw new Error('MediaRecorder API is not supported in this browser');
        }
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        streamRef.current = stream;
        // Try different MIME types for better compatibility
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/mp4';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = ''; // Let browser choose
            }
          }
        }
        
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: mimeType || undefined,
          audioBitsPerSecond: 128000
        });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && typeof event.data.size === 'number' && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            console.log('Audio chunk received:', event.data.size, 'bytes, total chunks:', audioChunksRef.current.length);
            
            // Check if we're approaching storage limits (warn at 100MB)
            const totalSize = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
            if (totalSize > 100 * 1024 * 1024) {
              console.warn('Recording approaching size limit:', totalSize, 'bytes');
            }
          }
        };
        
        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event);
          // Force stop recording on error to prevent hanging state
          setState(prev => ({
            ...prev,
            isRecording: false,
            isPaused: false,
            duration: 0,
            currentMeeting: undefined,
          }));
          
          if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
          }
        };
        
        mediaRecorder.onstart = () => {
          console.log('MediaRecorder started successfully');
        };
        
        mediaRecorder.onstop = () => {
          console.log('MediaRecorder stopped, total chunks:', audioChunksRef.current.length);
        };

        try {
          // Start with smaller timeslice for better reliability on long recordings
          // Use 1 second chunks to prevent data loss on long recordings
          mediaRecorder.start(1000); // 1 second chunks for better reliability
          console.log('MediaRecorder started with mimeType:', mimeType);
        } catch (e) {
          console.error('Failed to start MediaRecorder:', e);
          throw new Error('Failed to start recording. Please ensure your browser allows microphone access.');
        }
      } else {
        // Check permissions again before recording
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Microphone permission is required to record audio');
        }

        await Audio.setAudioModeAsync({ 
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: '.wav',
            outputFormat: Audio.IOSOutputFormat.LINEARPCM,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
          },
        });
        await recording.startAsync();
        recordingRef.current = recording;
      }

      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        duration: 0,
        currentMeeting: newMeeting,
      }));
      


      const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
      const updatedMeetings = [...currentMeetings, newMeeting];
      await saveMeetings(updatedMeetings);

      durationInterval.current = setInterval(() => {
        setState(prev => {
          if (!prev.isRecording) {
            // Clear interval if recording stopped
            if (durationInterval.current) {
              clearInterval(durationInterval.current);
              durationInterval.current = null;
            }
            return prev;
          }
          
          const newDuration = prev.duration + 1;
          
          if (newDuration >= MAX_RECORDING_DURATION) {
            console.log('Recording reached 30-minute limit, auto-stopping...');
            if (durationInterval.current) {
              clearInterval(durationInterval.current);
              durationInterval.current = null;
            }
            // Use setTimeout to avoid blocking the state update
            setTimeout(() => {
              stopRecordingRef.current?.().catch(console.error);
            }, 100);
          }
          
          return {
            ...prev,
            duration: newDuration,
          };
        });
      }, 1000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      
      // Clean up on error
      setState(prev => ({
        ...prev,
        isRecording: false,
        isPaused: false,
        duration: 0,
        currentMeeting: undefined,
      }));
      
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
      
      throw error;
    }
  }, [consentGiven, saveMeetings, state.isRecording]);

  const pauseRecording = useCallback(async () => {
    try {
      if (Platform.OS !== 'web' && recordingRef.current) {
        await recordingRef.current.pauseAsync();
      } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause();
      }
      
      setState(prev => ({ ...prev, isPaused: true }));
      
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
    } catch (error) {
      console.error('Failed to pause recording:', error);
      // Don't throw error for pause failures, just log it
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    try {
      if (Platform.OS !== 'web' && recordingRef.current) {
        await recordingRef.current.startAsync();
      } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
      }
      
      setState(prev => ({ ...prev, isPaused: false }));
      
      durationInterval.current = setInterval(() => {
        setState(prev => {
          if (!prev.isRecording) {
            // Clear interval if recording stopped
            if (durationInterval.current) {
              clearInterval(durationInterval.current);
              durationInterval.current = null;
            }
            return prev;
          }
          
          const newDuration = prev.duration + 1;
          
          if (newDuration >= MAX_RECORDING_DURATION) {
            console.log('Recording reached 30-minute limit, auto-stopping...');
            if (durationInterval.current) {
              clearInterval(durationInterval.current);
              durationInterval.current = null;
            }
            // Use setTimeout to avoid blocking the state update
            setTimeout(() => {
              stopRecordingRef.current?.().catch(console.error);
            }, 100);
          }
          
          return {
            ...prev,
            duration: newDuration,
          };
        });
      }, 1000);
    } catch (error) {
      console.error('Failed to resume recording:', error);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    try {
      let audioUri: string | null = null;

      if (Platform.OS === 'web') {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          return new Promise((resolve) => {
            const mediaRecorder = mediaRecorderRef.current!;
            
            const cleanup = () => {
              try {
                audioChunksRef.current = [];
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach(track => {
                    try {
                      track.stop();
                    } catch (e) {
                      console.warn('Failed to stop track:', e);
                    }
                  });
                  streamRef.current = null;
                }
                mediaRecorderRef.current = null;
              } catch (e) {
                console.warn('Cleanup error:', e);
              }
            };
            
            mediaRecorder.onstop = async () => {
              try {
                const meetingId = state.currentMeeting?.id;
                if (meetingId && audioChunksRef.current.length > 0) {
                  try {
                    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    if (blob.size > 0) {
                      await storeAudioBlob(meetingId, blob);
                      console.log('Stored web audio blob in IndexedDB:', { meetingId, size: blob.size });
                      
                      const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
                      const updatedMeetings = currentMeetings.map((m: Meeting) => 
                        m.id === meetingId 
                          ? { ...m, audioUri: `indexeddb://${meetingId}` }
                          : m
                      );
                      await saveMeetings(updatedMeetings);
                    }
                  } catch (e) {
                    console.error('Failed to persist web audio blob:', e);
                  }
                }
                
                cleanup();
                const placeholderUri = meetingId ? `indexeddb://${meetingId}` : null;
                await finishStopRecording(placeholderUri, resolve);
              } catch (error) {
                console.error('Error in onstop handler:', error);
                cleanup();
                resolve(null);
              }
            };
            
            mediaRecorder.onerror = (error) => {
              console.error('MediaRecorder error:', error);
              cleanup();
              resolve(null);
            };
            
            try {
              mediaRecorder.stop();
            } catch (e) {
              console.error('Failed to stop MediaRecorder:', e);
              cleanup();
              resolve(null);
            }
          });
        } else {
          // Nothing to stop, ensure cleanup
          if (streamRef.current) {
            try {
              streamRef.current.getTracks().forEach(t => t.stop());
            } catch {}
            streamRef.current = null;
          }
        }
      } else {
        if (recordingRef.current) {
          try {
            await recordingRef.current.stopAndUnloadAsync();
            const tempUri = recordingRef.current.getURI();
            const meetingId = state.currentMeeting?.id ?? Date.now().toString();
            
            if (tempUri) {
              try {
                const dirInfo = await FileSystem.getInfoAsync(RECORDINGS_DIR);
                if (!dirInfo.exists) {
                  await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
                }
                const ext = Platform.OS === 'ios' ? '.wav' : '.m4a';
                const dest = `${RECORDINGS_DIR}${meetingId}${ext}`;
                await FileSystem.moveAsync({ from: tempUri, to: dest });
                audioUri = dest;
                console.log('Saved recording to:', dest);
                
                const savedFileInfo = await FileSystem.getInfoAsync(dest);
                if (!savedFileInfo.exists || ('size' in savedFileInfo && savedFileInfo.size === 0)) {
                  console.error('Saved file is missing or empty:', dest);
                  audioUri = null;
                }
              } catch (e) {
                console.error('Failed to persist recording file:', e);
                audioUri = null;
              }
            }
          } catch (e) {
            console.error('Failed to stop recording:', e);
            audioUri = null;
          } finally {
            recordingRef.current = null;
            try {
              await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
            } catch (e) {
              console.warn('Failed to reset audio mode:', e);
            }
          }
        }
        
        return await finishStopRecording(audioUri);
      }

      return null;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      
      // Ensure cleanup on error
      try {
        if (Platform.OS !== 'web' && recordingRef.current) {
          recordingRef.current = null;
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        }
      } catch (e) {
        console.warn('Cleanup error:', e);
      }
      
      throw error;
    }
  }, [state.currentMeeting, finishStopRecording, saveMeetings, storeAudioBlob]);

  const updateMeetingArtifacts = useCallback(async (meetingId: string, artifacts: MeetingArtifacts) => {
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const updatedMeetings = currentMeetings.map((meeting: Meeting) => 
      meeting.id === meetingId 
        ? { ...meeting, artifacts, status: 'completed' as const }
        : meeting
    );
    await saveMeetings(updatedMeetings);
  }, [saveMeetings]);

  const processMeeting = useCallback(async (meetingId: string) => {
    console.log('Processing meeting:', meetingId);
    
    await loadMeetings();
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const meeting = currentMeetings.find((m: Meeting) => m.id === meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting with ID ${meetingId} not found`);
    }
    
    console.log('Meeting found:', {
      id: meeting.id,
      title: meeting.title,
      audioUri: meeting.audioUri,
      duration: meeting.duration,
      status: meeting.status
    });
    
    let hasAudio = false;
    let audioFileSize = 0;
    
    if (Platform.OS === 'web') {
      if (meeting.audioUri && meeting.audioUri.startsWith('indexeddb://')) {
        try {
          const blob = await getAudioBlob(meetingId);
          hasAudio = blob !== null && blob.size > 0;
          audioFileSize = blob?.size || 0;
          console.log('Web audio blob check:', { hasBlob: !!blob, size: audioFileSize });
        } catch (error) {
          console.error('Failed to get audio blob from IndexedDB:', error);
          hasAudio = false;
        }
      } else {
        console.log('No valid web audio URI found:', meeting.audioUri);
      }
    } else {
      if (meeting.audioUri && meeting.audioUri.length > 0) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(meeting.audioUri);
          hasAudio = fileInfo.exists && ('size' in fileInfo ? (fileInfo.size ?? 0) : 0) > 0;
          audioFileSize = 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;
          console.log('Native audio file check:', {
            exists: fileInfo.exists,
            size: audioFileSize,
            uri: meeting.audioUri
          });
        } catch (error) {
          console.error('Failed to check native audio file:', error);
          hasAudio = false;
        }
      } else {
        console.log('No valid native audio URI found:', meeting.audioUri);
      }
    }
    
    if (!hasAudio) {
      console.error(`Audio source missing and no artifacts available, cannot process: ${meetingId}`);
      console.error('Audio validation failed:', {
        platform: Platform.OS,
        audioUri: meeting.audioUri,
        audioFileSize,
        hasAudio
      });
      throw new Error('Audio file not found or is empty. The recording may have failed. Please try recording again.');
    }
    
    if (audioFileSize < 1000) { // Less than 1KB
      console.error(`Audio file too small: ${audioFileSize} bytes`);
      throw new Error('Audio file is too small (less than 1KB). The recording may be corrupted. Please try recording again.');
    }

    try {
      setProcessingProgress({ stage: 'transcribing', progress: 0, message: 'Preparing audio for transcription...' });
      
      let audioFile: File | { uri: string; name: string; type: string };
      
      if (Platform.OS === 'web') {
        const blob = await getAudioBlob(meetingId);
        if (!blob || blob.size === 0) {
          throw new Error('Audio file not found in browser storage.');
        }
        
        console.log('Creating web audio file:', {
          blobSize: blob.size,
          blobType: blob.type
        });
        
        audioFile = new File([blob], 'recording.webm', { type: 'audio/webm' });
      } else {
        const fileInfo = await FileSystem.getInfoAsync(meeting.audioUri);
        if (!fileInfo.exists) {
          throw new Error('Audio file not found on device.');
        }
        
        const fileSize = 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;
        if (fileSize === 0) {
          throw new Error('Audio file is empty.');
        }
        
        const uriParts = meeting.audioUri.split('.');
        const fileType = uriParts[uriParts.length - 1];
        
        console.log('Creating native audio file:', {
          uri: meeting.audioUri,
          fileSize,
          fileType
        });
        
        audioFile = {
          uri: meeting.audioUri,
          name: `recording.${fileType}`,
          type: `audio/${fileType}`,
        };
      }

      const attendeeNames = meeting.attendees.map((a: any) => a.name);
      const shouldUseStreaming = meeting.duration >= 300; // 5 minutes
      
      console.log('Starting transcription with:', {
        shouldUseStreaming,
        duration: meeting.duration,
        attendeeCount: attendeeNames.length
      });
      
      const result = shouldUseStreaming 
        ? await processFullMeetingStreaming(
            audioFile,
            meeting.title,
            attendeeNames,
            meeting.duration,
            (progress) => setProcessingProgress(progress)
          )
        : await processFullMeeting(
            audioFile,
            meeting.title,
            attendeeNames,
            (progress) => setProcessingProgress(progress)
          );

      console.log('Processing completed successfully:', {
        transcriptLength: result.transcript.length,
        actionItemsCount: result.artifacts.action_items.length,
        decisionsCount: result.artifacts.decisions.length
      });

      const latestMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
      const updatedMeetings = latestMeetings.map((m: Meeting) => 
        m.id === meetingId 
          ? { 
              ...m, 
              artifacts: result.artifacts, 
              status: 'completed' as const,
              transcript: {
                segments: [],
                speakers: [],
                confidence: 0.9,
              }
            }
          : m
      );
      
      await saveMeetings(updatedMeetings);
      setProcessingProgress(null);
      
      return result;
    } catch (error) {
      console.error('Failed to process meeting:', error);
      
      const latestMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
      const updatedMeetings = latestMeetings.map((m: Meeting) => 
        m.id === meetingId 
          ? { ...m, status: 'error' as const }
          : m
      );
      await saveMeetings(updatedMeetings);
      setProcessingProgress(null);
      
      if (error instanceof Error) {
        console.error('Processing error details:', {
          message: error.message,
          stack: error.stack
        });
        
        if (error.message.includes('Invalid transcript') || error.message.includes('too short')) {
          throw new Error('The recording appears to be empty or too short. Please try recording again with clear audio.');
        } else if (error.message.includes('transcribe') || error.message.includes('Audio file')) {
          throw new Error('Failed to transcribe audio. Please check your internet connection and try again.');
        } else if (error.message.includes('Network') || error.message.includes('fetch')) {
          throw new Error('Network error occurred. Please check your internet connection and try again.');
        }
      }
      
      throw error;
    }
  }, [saveMeetings, getAudioBlob, loadMeetings]);

  const deleteMeeting = useCallback(async (meetingId: string) => {
    try {
      const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
      const meeting = currentMeetings.find((m: Meeting) => m.id === meetingId);
      
      if (meeting?.audioUri) {
        if (Platform.OS === 'web') {
          await deleteAudioBlob(meetingId);
        } else {
          const fileInfo = await FileSystem.getInfoAsync(meeting.audioUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(meeting.audioUri);
          }
        }
      }
      
      const updatedMeetings = currentMeetings.filter((m: Meeting) => m.id !== meetingId);
      await saveMeetings(updatedMeetings);
    } catch (error) {
      console.error('Failed to delete meeting files:', error);
      const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
      const updatedMeetings = currentMeetings.filter((m: Meeting) => m.id !== meetingId);
      await saveMeetings(updatedMeetings);
    }
  }, [saveMeetings, deleteAudioBlob]);

  const retryProcessing = useCallback(async (meetingId: string) => {
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const updatedMeetings = currentMeetings.map((m: Meeting) => 
      m.id === meetingId 
        ? { ...m, status: 'processing' as const }
        : m
    );
    await saveMeetings(updatedMeetings);
    
    return processMeeting(meetingId);
  }, [saveMeetings, processMeeting]);

  useEffect(() => {
    // Add hydration delay to prevent SSR mismatch
    const timer = setTimeout(() => {
      setIsHydrated(true);
      loadMeetings();
      setupAudio();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [loadMeetings, setupAudio]);

  useEffect(() => {
    stopRecordingRef.current = async () => {
      try {
        return await stopRecording();
      } catch (e) {
        console.error('Auto-stop failed:', e);
        
        // Force cleanup on auto-stop failure
        if (durationInterval.current) {
          clearInterval(durationInterval.current);
          durationInterval.current = null;
        }
        
        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          duration: 0,
          currentMeeting: undefined,
        }));
        
        return null;
      }
    };
  }, [stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
      
      // Clean up recording resources
      if (Platform.OS === 'web') {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (e) {
              console.warn('Failed to stop track on cleanup:', e);
            }
          });
        }
      } else {
        if (recordingRef.current) {
          recordingRef.current.stopAndUnloadAsync().catch(console.warn);
        }
      }
    };
  }, []);

  const value = useMemo(() => {
    const visibleMeetings = isHydrated ? meetings : [];
    return {
      state,
      meetings: visibleMeetings,
      consentGiven,
      processingProgress,
      isHydrated,

      setConsentGiven,
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      updateMeetingArtifacts,
      processMeeting,
      retryProcessing,
      deleteMeeting,
    };
  }, [
    state,
    meetings,
    consentGiven,
    processingProgress,
    isHydrated,

    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    updateMeetingArtifacts,
    processMeeting,
    retryProcessing,
    deleteMeeting,
  ]);

  return value;
});