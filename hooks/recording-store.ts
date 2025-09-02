import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Meeting, RecordingState, MeetingArtifacts } from '@/types/meeting';
import { processFullMeeting, processFullMeetingStreaming, ProcessingProgress, transcribeAudio, processTranscript, generateEmailDraft } from '@/services/ai-api';

const RECORDINGS_DIR = `${FileSystem.documentDirectory}recordings/`;
const MAX_RECORDING_DURATION = 15 * 60; // 15 minutes in seconds

const MIN_CHUNK_DURATION = 10; // Minimum 10 seconds before processing

export const [RecordingProvider, useRecording] = createContextHook(() => {
  // All useState hooks first - always in the same order
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioLevels: [],
  });
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [consentGiven, setConsentGiven] = useState<boolean>(false);
  const [realTimeArtifacts, setRealTimeArtifacts] = useState<MeetingArtifacts | null>(null);
  const [isRealTimeProcessing, setIsRealTimeProcessing] = useState<boolean>(false);
  
  // All useRef hooks after useState - always in the same order
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const realTimeProcessingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProcessedTimeRef = useRef<number>(0);
  const accumulatedTranscriptRef = useRef<string>('');
  const stopRecordingRef = useRef<(() => Promise<string | null>) | null>(null);
  
  useEffect(() => {
    stopRecordingRef.current = async () => {
      try {
        return await stopRecording();
      } catch (e) {
        console.error('Auto-stop failed:', e);
        return null;
      }
    };
  }, []);
  
  // All useCallback hooks - always in the same order

  // Web-specific audio storage functions - defined first
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

  // Core functions
  const setupAudio = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
        
        // Ensure recordings directory exists
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

  // Real-time processing functions
  const processCurrentChunk = useCallback(async (_meetingId: string, _currentTime: number) => {
    try {
      console.log('Real-time processing disabled: deferring all processing until recording stops');
      return;
    } catch (error) {
      console.error('Failed to process current chunk:', error);
    }
  }, [meetings]);

  const startRealTimeProcessing = useCallback((_meetingId: string) => {
    console.log('Real-time processing disabled');
    if (realTimeProcessingRef.current) {
      clearInterval(realTimeProcessingRef.current);
      realTimeProcessingRef.current = null;
    }
  }, []);
  
  const stopRealTimeProcessing = useCallback(() => {
    if (realTimeProcessingRef.current) {
      clearInterval(realTimeProcessingRef.current);
      realTimeProcessingRef.current = null;
    }
    setIsRealTimeProcessing(false);
  }, []);

  const finishStopRecording = useCallback(async (audioUri: string | null, resolve?: (value: string | null) => void): Promise<string | null> => {
    try {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      if (state.currentMeeting) {
        console.log('Finishing recording for meeting:', state.currentMeeting.id);
        console.log('Audio URI:', audioUri);
        console.log('Recording duration:', state.duration, 'seconds');
        
        // Only process if we have a valid recording duration and audio
        const shouldProcess = state.duration > 0 && audioUri !== null;
        
        const updatedMeeting: Meeting = {
          ...state.currentMeeting,
          duration: state.duration,
          audioUri: audioUri ?? state.currentMeeting.audioUri,
          status: shouldProcess ? 'processing' : 'error',
          artifacts: state.currentMeeting.artifacts,
        };

        const updatedMeetings = meetings.map(m => 
          m.id === updatedMeeting.id ? updatedMeeting : m
        );
        await saveMeetings(updatedMeetings);
        console.log('Meeting saved with status:', updatedMeeting.status);

        // Only process if we have a valid recording
        if (updatedMeeting.status === 'processing' && updatedMeeting.duration > 0 && updatedMeeting.audioUri) {
          // Defer processing to avoid issues with function ordering
          console.log('Meeting ready for background processing:', updatedMeeting.id);
          console.log('Audio URI for processing:', updatedMeeting.audioUri);
          console.log('Meeting duration:', updatedMeeting.duration, 'seconds');
          // The meetings page will pick this up and trigger processing
        } else if (updatedMeeting.status === 'error') {
          console.warn('Recording was too short or audio missing, marked as error');
          console.warn('Audio URI:', updatedMeeting.audioUri);
          console.warn('Duration:', updatedMeeting.duration);
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

      console.log('No current meeting found when finishing recording');
      if (resolve) {
        resolve(null);
      }
      return null;
    } catch (error) {
      console.error('Failed to finish stop recording:', error);
      if (resolve) {
        resolve(null);
      }
      return null;
    }
  }, [state.currentMeeting, state.duration, meetings, saveMeetings]);

  const startRecording = useCallback(async (title: string, attendees: string[] = []) => {
    if (!consentGiven) {
      throw new Error('Recording consent required');
    }

    try {
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
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        streamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(1000); // Collect data every second
        
        // Real-time processing disabled
      } else {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true });
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
        
        // Real-time processing disabled on native
      }

      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        duration: 0,
        currentMeeting: newMeeting,
      }));

      const updatedMeetings = [...meetings, newMeeting];
      await saveMeetings(updatedMeetings);

      durationInterval.current = setInterval(() => {
        setState(prev => {
          const newDuration = prev.duration + 1;
          
          if (newDuration >= MAX_RECORDING_DURATION) {
            console.log('Recording reached 15-minute limit, auto-stopping...');
            if (durationInterval.current) {
              clearInterval(durationInterval.current);
              durationInterval.current = null;
            }
            // Safely trigger stop without changing hooks order
            stopRecordingRef.current?.();
          }
          
          return {
            ...prev,
            duration: newDuration,
          };
        });
      }, 1000);
      
      // Reset real-time processing state
      setRealTimeArtifacts(null);
      setIsRealTimeProcessing(false);
      lastProcessedTimeRef.current = 0;
      accumulatedTranscriptRef.current = '';

    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }, [consentGiven, meetings, saveMeetings, startRealTimeProcessing]);

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
      
      // Stop real-time processing
      stopRealTimeProcessing();
    } catch (error) {
      console.error('Failed to pause recording:', error);
    }
  }, [stopRealTimeProcessing]);

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
          const newDuration = prev.duration + 1;
          
          if (newDuration >= MAX_RECORDING_DURATION) {
            console.log('Recording reached 15-minute limit, auto-stopping...');
            if (durationInterval.current) {
              clearInterval(durationInterval.current);
              durationInterval.current = null;
            }
            // Safely trigger stop without changing hooks order
            stopRecordingRef.current?.();
          }
          
          return {
            ...prev,
            duration: newDuration,
          };
        });
      }, 1000);
      
      // Real-time processing disabled
    } catch (error) {
      console.error('Failed to resume recording:', error);
    }
  }, [state.currentMeeting]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    try {
      let audioUri: string | null = null;

      if (Platform.OS === 'web') {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          return new Promise((resolve) => {
            const mediaRecorder = mediaRecorderRef.current!;
            
            mediaRecorder.onstop = async () => {
              try {
                const meetingId = state.currentMeeting?.id;
                if (meetingId) {
                  try {
                    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    if (blob.size > 0) {
                      await storeAudioBlob(meetingId, blob);
                      console.log('Stored web audio blob in IndexedDB:', { meetingId, size: blob.size });
                      
                      // Update meeting with a placeholder URI to indicate audio exists
                      const updatedMeetings = meetings.map(m => 
                        m.id === meetingId 
                          ? { ...m, audioUri: `indexeddb://${meetingId}` }
                          : m
                      );
                      await saveMeetings(updatedMeetings);
                    } else {
                      console.warn('Final web audio blob is empty; skipping storage');
                    }
                  } catch (e) {
                    console.error('Failed to persist web audio blob:', e);
                  }
                }
                audioChunksRef.current = [];
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach(track => track.stop());
                  streamRef.current = null;
                }
                stopRealTimeProcessing();
                const placeholderUri = meetingId ? `indexeddb://${meetingId}` : null;
                await finishStopRecording(placeholderUri, resolve);
              } catch (error) {
                console.error('Error in onstop handler:', error);
                resolve(null);
              }
            };
            
            mediaRecorder.stop();
          });
        }
      } else {
        if (recordingRef.current) {
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
              
              // Verify the file was saved correctly
              const savedFileInfo = await FileSystem.getInfoAsync(dest);
              if (!savedFileInfo.exists || savedFileInfo.size === 0) {
                console.error('Saved file is missing or empty:', dest);
                audioUri = null;
              }
            } catch (e) {
              console.error('Failed to persist recording file:', e);
              audioUri = null;
            }
          } else {
            console.warn('No recording URI available from recording object');
          }
          recordingRef.current = null;
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        }
        
        // Ensure real-time processing is stopped
        stopRealTimeProcessing();
        
        return await finishStopRecording(audioUri);
      }

      return null;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      throw error;
    }
  }, [state.currentMeeting, finishStopRecording, stopRealTimeProcessing]);

  const updateMeetingArtifacts = useCallback(async (meetingId: string, artifacts: MeetingArtifacts) => {
    const updatedMeetings = meetings.map(meeting => 
      meeting.id === meetingId 
        ? { ...meeting, artifacts, status: 'completed' as const }
        : meeting
    );
    await saveMeetings(updatedMeetings);
  }, [meetings, saveMeetings]);

  const processMeeting = useCallback(async (meetingId: string) => {
    console.log('Processing meeting:', meetingId);
    console.log('Available meetings:', meetings.map(m => ({ id: m.id, audioUri: m.audioUri, status: m.status })));
    
    // Refresh meetings from storage to ensure we have the latest data
    await loadMeetings();
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const meeting = currentMeetings.find((m: Meeting) => m.id === meetingId);
    
    if (!meeting) {
      console.error('Meeting not found:', meetingId);
      console.error('Available meeting IDs:', currentMeetings.map((m: Meeting) => m.id));
      throw new Error(`Meeting with ID ${meetingId} not found`);
    }
    
    // Check for audio availability based on platform
    let hasAudio = false;
    console.log('Checking audio availability for meeting:', meetingId);
    console.log('Meeting audio URI:', meeting.audioUri);
    console.log('Platform:', Platform.OS);
    
    if (Platform.OS === 'web') {
      // For web, check if audio exists in IndexedDB
      if (meeting.audioUri && meeting.audioUri.startsWith('indexeddb://')) {
        const blob = await getAudioBlob(meetingId);
        hasAudio = blob !== null && blob.size > 0;
        if (!hasAudio) {
          console.error('No audio blob found in IndexedDB for meeting:', meetingId);
        } else {
          console.log('Found audio blob in IndexedDB, size:', blob!.size);
        }
      } else {
        console.error('Invalid or missing audio URI for web platform:', meeting.audioUri);
      }
    } else {
      // For native, check if audio file exists
      if (meeting.audioUri && meeting.audioUri.length > 0) {
        try {
          console.log('Checking native audio file at:', meeting.audioUri);
          const fileInfo = await FileSystem.getInfoAsync(meeting.audioUri);
          console.log('File info:', { exists: fileInfo.exists, size: 'size' in fileInfo ? fileInfo.size : 0 });
          hasAudio = fileInfo.exists && ('size' in fileInfo ? (fileInfo.size ?? 0) : 0) > 0;
          if (!hasAudio) {
            console.error('Audio file missing or empty at path:', meeting.audioUri);
            console.error('File exists:', fileInfo.exists, 'Size:', 'size' in fileInfo ? fileInfo.size : 0);
          }
        } catch (e) {
          console.error('Error checking audio file:', e);
          hasAudio = false;
        }
      } else {
        console.error('No audio URI provided for native platform');
      }
    }
    
    if (!hasAudio) {
      console.warn('Audio missing for meeting, checking for existing artifacts:', meetingId);
      if (meeting.artifacts) {
        // If we already have artifacts, just regenerate the email draft if needed
        const attendeeNames = meeting.attendees.map((a: any) => a.name);
        const emailDraft = await generateEmailDraft({
          meetingTitle: meeting.title,
          meetingDate: meeting.date,
          attendees: attendeeNames,
          artifacts: meeting.artifacts,
        }).catch((e: unknown) => {
          console.warn('Email draft generation fallback failed:', e);
          return undefined;
        });
        const result = {
          transcript: meeting.transcript ? meeting.transcript.segments.map((s: any) => s.text).join(' ') : '',
          artifacts: emailDraft ? { ...meeting.artifacts, email_draft: emailDraft } : meeting.artifacts,
          emailDraft: emailDraft ?? meeting.artifacts.email_draft,
        } as { transcript: string; artifacts: MeetingArtifacts; emailDraft: MeetingArtifacts['email_draft'] };

        const latestMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
        const updatedMeetings = latestMeetings.map((m: Meeting) => 
          m.id === meetingId 
            ? { ...m, artifacts: result.artifacts, status: 'completed' as const }
            : m
        );
        await saveMeetings(updatedMeetings);
        setProcessingProgress(null);
        return result as any;
      }
      console.error('Audio source missing and no artifacts available, cannot process:', meetingId);
      throw new Error('Audio file not found. The recording may have been lost or corrupted. Please record the meeting again.');
    }

    try {
      setProcessingProgress({ stage: 'transcribing', progress: 0, message: 'Starting processing...' });
      
      let audioFile: File | { uri: string; name: string; type: string };
      
      if (Platform.OS === 'web') {
        console.log('Processing web audio for meeting:', meetingId);
        // Retrieve blob from IndexedDB
        const blob = await getAudioBlob(meetingId);
        if (!blob) {
          console.error('Audio blob not found in IndexedDB for meeting:', meetingId);
          throw new Error('Audio file not found in browser storage. The recording may have been lost.');
        }
        
        // Validate blob size
        if (blob.size === 0) {
          console.error('Audio blob is empty for meeting:', meetingId);
          throw new Error('Audio file is empty. The recording may be corrupted.');
        }
        
        audioFile = new File([blob], 'recording.webm', { type: 'audio/webm' });
        console.log('Web audio file prepared, size:', blob.size, 'bytes');
      } else {
        console.log('Processing native audio file:', meeting.audioUri);
        // Check if file exists
        const fileInfo = await FileSystem.getInfoAsync(meeting.audioUri);
        if (!fileInfo.exists) {
          console.error('Audio file does not exist at path:', meeting.audioUri);
          throw new Error('Audio file not found on device. The recording may have been deleted.');
        }
        
        // Validate file size
        if (fileInfo.size === 0) {
          console.error('Audio file is empty at path:', meeting.audioUri);
          throw new Error('Audio file is empty. The recording may be corrupted.');
        }
        
        const uriParts = meeting.audioUri.split('.');
        const fileType = uriParts[uriParts.length - 1];
        audioFile = {
          uri: meeting.audioUri,
          name: `recording.${fileType}`,
          type: `audio/${fileType}`,
        };
        console.log('Native audio file prepared:', audioFile, 'size:', fileInfo.size, 'bytes');
      }

      const attendeeNames = meeting.attendees.map((a: any) => a.name);
      console.log('Starting AI processing with attendees:', attendeeNames);
      
      // Use streaming processing for meetings ≥5 minutes or larger files
      const shouldUseStreaming = meeting.duration >= 300 || 
        ('size' in audioFile && audioFile.size > 3 * 1024 * 1024); // 5 minutes or 3MB
      console.log(`Using ${shouldUseStreaming ? 'streaming' : 'standard'} processing for ${meeting.duration}s meeting`);
      
      // Add timeout handling for long recordings
      const timeoutMs = Math.max(30 * 60 * 1000, meeting.duration * 2000); // 30 minutes or 2x duration, whichever is longer
      console.log(`Setting processing timeout to ${timeoutMs / 1000} seconds`);
      
      const result = shouldUseStreaming 
        ? await processFullMeetingStreaming(
            audioFile,
            meeting.title,
            attendeeNames,
            meeting.duration,
            (progress) => {
              console.log('Streaming processing progress:', progress);
              setProcessingProgress(progress);
            }
          )
        : await processFullMeeting(
            audioFile,
            meeting.title,
            attendeeNames,
            (progress) => {
              console.log('Standard processing progress:', progress);
              setProcessingProgress(progress);
            }
          );

      console.log('AI processing completed successfully');
      
      // Refresh meetings again before updating
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
      console.log('Meeting processing completed and saved');
      
      return result;
    } catch (error) {
      console.error('Failed to process meeting:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        meetingId,
        audioUri: meeting.audioUri
      });
      
      // Refresh meetings before updating error status
      const latestMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
      const updatedMeetings = latestMeetings.map((m: Meeting) => 
        m.id === meetingId 
          ? { ...m, status: 'error' as const }
          : m
      );
      await saveMeetings(updatedMeetings);
      setProcessingProgress(null);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('Invalid transcription response') || error.message.includes('missing or invalid text field')) {
          throw new Error('Transcription failed: The audio could not be processed. Please check your internet connection and try again.');
        } else if (error.message.includes('Audio file not found')) {
          throw new Error('Audio file missing: The recording file could not be found. Please try recording again.');
        } else if (error.message.includes('empty') || error.message.includes('silent') || error.message.includes('too short')) {
          throw new Error('Empty recording: The audio appears to be silent, empty, or too short. Please try recording again.');
        } else if (error.message.includes('corrupted')) {
          throw new Error('Corrupted audio: The recording file appears to be damaged. Please try recording again.');
        } else if (error.message.includes('timed out')) {
          throw new Error('Processing timeout: The recording is too long or complex. Please try with a shorter recording.');
        } else if (error.message.includes('service is unavailable')) {
          throw new Error('Service unavailable: The transcription service is temporarily unavailable. Please try again later.');
        }
      }
      
      throw error;
    }
  }, [meetings, saveMeetings, getAudioBlob, loadMeetings]);

  const deleteMeeting = useCallback(async (meetingId: string) => {
    try {
      const meeting = meetings.find(m => m.id === meetingId);
      
      // Delete audio file
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
      
      const updatedMeetings = meetings.filter(m => m.id !== meetingId);
      await saveMeetings(updatedMeetings);
    } catch (error) {
      console.error('Failed to delete meeting files:', error);
      // Still remove from meetings list even if file deletion fails
      const updatedMeetings = meetings.filter(m => m.id !== meetingId);
      await saveMeetings(updatedMeetings);
    }
  }, [meetings, saveMeetings, deleteAudioBlob]);

  const retryProcessing = useCallback(async (meetingId: string) => {
    console.log('Retrying processing for meeting:', meetingId);
    
    // Reset meeting status to processing
    const updatedMeetings = meetings.map(m => 
      m.id === meetingId 
        ? { ...m, status: 'processing' as const }
        : m
    );
    await saveMeetings(updatedMeetings);
    
    // Attempt processing again
    return processMeeting(meetingId);
  }, [meetings, saveMeetings, processMeeting]);

  // useEffect hook - always in the same order
  useEffect(() => {
    loadMeetings();
    setupAudio();
  }, [loadMeetings, setupAudio]);

  return useMemo(() => ({
    state,
    meetings,
    consentGiven,
    processingProgress,
    realTimeArtifacts,
    isRealTimeProcessing,
    setConsentGiven,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    updateMeetingArtifacts,
    processMeeting,
    retryProcessing,
    deleteMeeting,
  }), [
    state,
    meetings,
    consentGiven,
    processingProgress,
    realTimeArtifacts,
    isRealTimeProcessing,
    setConsentGiven,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    updateMeetingArtifacts,
    processMeeting,
    retryProcessing,
    deleteMeeting,
  ]);
});