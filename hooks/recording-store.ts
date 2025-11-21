import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Meeting, RecordingState, Note, Bookmark } from '@/types/meeting';
import { processTranscriptOnly, ProcessingProgress } from '@/services/ai-api';
import { transcribeAudio } from '@/services/transcription-api';

const RECORDINGS_DIR = `${FileSystem.documentDirectory}recordings/`;
const MAX_RECORDING_DURATION = 3600 * 4;

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
  const meetingIdRef = useRef<string | null>(null);

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
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
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

  const startRecording = useCallback(async (title: string, attendees: string[] = []) => {
    if (!consentGiven) {
      throw new Error('Recording consent required');
    }

    const meetingId = Date.now().toString();
    meetingIdRef.current = meetingId;
    
    const newMeeting: Meeting = {
      id: meetingId,
      title,
      date: new Date().toISOString(),
      duration: 0,
      attendees: attendees.map(name => ({ name })),
      status: 'recording',
    };

    if (Platform.OS === 'web') {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('[Web Recording] Data chunk available:', {
          chunkSize: event.data.size,
          totalChunks: audioChunksRef.current.length + 1
        });
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        } else {
          console.warn('[Web Recording] Received empty data chunk');
        }
      };

      mediaRecorder.start(1000);
    } else {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Microphone permission required');
      }

      await Audio.setAudioModeAsync({ 
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
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
    await saveMeetings([...currentMeetings, newMeeting]);

    durationInterval.current = setInterval(() => {
      setState(prev => {
        const newDuration = prev.duration + 1;
        if (newDuration >= MAX_RECORDING_DURATION) {
          if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
          }
        }
        return { ...prev, duration: newDuration };
      });
    }, 1000);
  }, [consentGiven, saveMeetings]);

  const pauseRecording = useCallback(async () => {
    if (Platform.OS !== 'web' && recordingRef.current) {
      await recordingRef.current.pauseAsync();
    } else if (mediaRecorderRef.current) {
      mediaRecorderRef.current.pause();
    }
    
    setState(prev => ({ ...prev, isPaused: true }));
    
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    if (Platform.OS !== 'web' && recordingRef.current) {
      await recordingRef.current.startAsync();
    } else if (mediaRecorderRef.current) {
      mediaRecorderRef.current.resume();
    }
    
    setState(prev => ({ ...prev, isPaused: false }));
    
    durationInterval.current = setInterval(() => {
      setState(prev => ({ ...prev, duration: prev.duration + 1 }));
    }, 1000);
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }

    let audioUri: string | null = null;

    if (Platform.OS === 'web') {
      if (mediaRecorderRef.current) {
        return new Promise((resolve) => {
          const mediaRecorder = mediaRecorderRef.current!;
          
          mediaRecorder.onstop = async () => {
            const meetingId = meetingIdRef.current;
            console.log('[Web Recording] MediaRecorder stopped');
            console.log('[Web Recording] Meeting ID:', meetingId);
            console.log('[Web Recording] Audio chunks collected:', audioChunksRef.current.length);
            console.log('[Web Recording] Chunk sizes:', audioChunksRef.current.map(c => c.size));
            
            if (meetingId && audioChunksRef.current.length > 0) {
              const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
              console.log('[Web Recording] Created audio blob:', { 
                size: blob.size, 
                type: blob.type,
                sizeInMB: (blob.size / (1024 * 1024)).toFixed(2) + ' MB'
              });
              
              if (blob.size === 0) {
                console.error('[Web Recording] ERROR: Blob is empty despite having chunks!');
              }
              
              try {
                await storeAudioBlob(meetingId, blob);
                console.log('[Web Recording] ✓ Audio blob stored successfully in IndexedDB');
              } catch (error) {
                console.error('[Web Recording] ✗ Failed to store audio blob:', error);
              }
              
              const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
              const updatedMeetings = currentMeetings.map((m: Meeting) => 
                m.id === meetingId 
                  ? { ...m, audioUri: `indexeddb://${meetingId}`, status: 'processing', duration: state.duration }
                  : m
              );
              await saveMeetings(updatedMeetings);
              console.log('Meeting status updated to processing');
            } else {
              console.error('Cannot save audio:', { meetingId, chunksLength: audioChunksRef.current.length });
            }
            
            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
              streamRef.current = null;
            }
            
            setState(prev => ({
              ...prev,
              isRecording: false,
              isPaused: false,
              duration: 0,
              currentMeeting: undefined,
            }));
            
            resolve(meetingId || null);
          };
          
          console.log('[Web Recording] Requesting final data before stop...');
          mediaRecorder.requestData();
          console.log('[Web Recording] Stopping MediaRecorder...');
          mediaRecorder.stop();
        });
      }
    } else {
      if (recordingRef.current) {
        console.log('[Native Recording] Stopping recording...');
        await recordingRef.current.stopAndUnloadAsync();
        const tempUri = recordingRef.current.getURI();
        const meetingId = state.currentMeeting?.id ?? Date.now().toString();
        
        console.log('[Native Recording] Temp URI:', tempUri);
        
        if (tempUri) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(tempUri);
            console.log('[Native Recording] File info:', {
              exists: fileInfo.exists,
              size: fileInfo.exists ? fileInfo.size : 'N/A',
              sizeInMB: fileInfo.exists && fileInfo.size ? (fileInfo.size / (1024 * 1024)).toFixed(2) + ' MB' : 'N/A',
              uri: tempUri
            });
            
            if (!fileInfo.exists) {
              console.error('[Native Recording] ✗ ERROR: Recording file does not exist!');
            } else if (fileInfo.size === 0) {
              console.error('[Native Recording] ✗ ERROR: Recording file is empty (0 bytes)!');
            } else {
              console.log('[Native Recording] ✓ Recording file looks valid');
            }
          } catch (error) {
            console.error('[Native Recording] ✗ Error checking file info:', error);
          }
          
          const dest = `${RECORDINGS_DIR}${meetingId}.m4a`;
          console.log('[Native Recording] Moving file to:', dest);
          await FileSystem.moveAsync({ from: tempUri, to: dest });
          audioUri = dest;
          console.log('[Native Recording] ✓ File moved successfully');
          
          const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
          const updatedMeetings = currentMeetings.map((m: Meeting) => 
            m.id === meetingId 
              ? { ...m, audioUri, status: 'processing', duration: state.duration }
              : m
          );
          await saveMeetings(updatedMeetings);
          console.log('[Native Recording] ✓ Meeting status updated');
        } else {
          console.error('[Native Recording] ✗ ERROR: No URI returned from recording!');
        }
        
        recordingRef.current = null;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      }
    }ondataavailable
    

    setState(prev => ({
      ...prev,
      isRecording: false,
      isPaused: false,
      duration: 0,
      currentMeeting: undefined,
    }));
    
    return state.currentMeeting?.id || null;
  }, [state.currentMeeting, state.duration, saveMeetings, storeAudioBlob]);

  const processMeeting = useCallback(async (meetingId: string) => {
    try {
      const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
      const meeting = currentMeetings.find((m: Meeting) => m.id === meetingId);
      
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      setProcessingProgress({ stage: 'transcribing', progress: 10, message: 'Transcribing audio...' });
    
    let audioFile: File | { uri: string; name: string; type: string };
    
    if (Platform.OS === 'web') {
      const blob = await getAudioBlob(meetingId);
      if (!blob) {
        throw new Error('Audio not found');
      }
      audioFile = new File([blob], 'recording.webm', { type: 'audio/webm' });
    } else {
      audioFile = {
        uri: meeting.audioUri,
        name: 'recording.m4a',
        type: 'audio/m4a',
      };
    }

    let transcriptionResult;    
    let transcript;
    
    try {
      transcriptionResult = await transcribeAudio(audioFile, meeting.language);
      transcript = transcriptionResult.text;
      
      console.log('Transcription successful:', {
        textLength: transcript.length,
        preview: transcript.substring(0, 100)
      });
      
      // Additional validation
      if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
        throw new Error('Transcription returned empty text');
      }
    } catch (transcriptionError) {
      console.error('Transcription error:', transcriptionError);
      throw new Error(
        transcriptionError instanceof Error 
          ? transcriptionError.message 
          : 'Failed to transcribe audio. Please try recording again.'
      );
    }

    setProcessingProgress({ stage: 'refining', progress: 50, message: 'Analyzing transcript...' });
    
    const result = await processTranscriptOnly(
      transcript,
      meeting.title,
      meeting.attendees.map((a: any) => a.name),
      (progress) => setProcessingProgress(progress)
    );

      const updatedMeetings = currentMeetings.map((m: Meeting) => 
        m.id === meetingId 
          ? { 
              ...m, 
              artifacts: result.artifacts, 
              status: 'completed',
              transcript: {
                segments: [],
                speakers: [],
                confidence: 0.9,
                fullText: transcript,
              }
            }
          : m
      );
      
      await saveMeetings(updatedMeetings);
      setProcessingProgress(null);
      
      return result;
    } catch (error) {
      console.error('Meeting processing failed:', error);
      
      // Update meeting status to error
      const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
      const updatedMeetings = currentMeetings.map((m: Meeting) => 
        m.id === meetingId ? { ...m, status: 'error' } : m
      );
      await saveMeetings(updatedMeetings);
      setProcessingProgress(null);
      
      // Re-throw with user-friendly message
      throw error;
    }
  }, [saveMeetings, getAudioBlob]);

  const deleteMeeting = useCallback(async (meetingId: string) => {
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const meeting = currentMeetings.find((m: Meeting) => m.id === meetingId);
    
    if (meeting?.audioUri) {
      if (Platform.OS === 'web') {
        await deleteAudioBlob(meetingId);
      } else if (meeting.audioUri) {
        const fileInfo = await FileSystem.getInfoAsync(meeting.audioUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(meeting.audioUri);
        }
      }
    }
    
    const updatedMeetings = currentMeetings.filter((m: Meeting) => m.id !== meetingId);
    await saveMeetings(updatedMeetings);
  }, [saveMeetings, deleteAudioBlob]);

  const retryProcessing = useCallback(async (meetingId: string) => {
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const updatedMeetings = currentMeetings.map((m: Meeting) => 
      m.id === meetingId ? { ...m, status: 'processing' } : m
    );
    await saveMeetings(updatedMeetings);
    return processMeeting(meetingId);
  }, [saveMeetings, processMeeting]);

  const addNote = useCallback(async (text: string, timestamp: number) => {
    if (!state.currentMeeting) return;
    
    const note: Note = {
      id: Date.now().toString(),
      text,
      timestamp,
      createdAt: new Date().toISOString(),
    };
    
    const updatedMeeting = {
      ...state.currentMeeting,
      notes: [...(state.currentMeeting.notes || []), note],
    };
    
    setState(prev => ({ ...prev, currentMeeting: updatedMeeting }));
    
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const updatedMeetings = currentMeetings.map((m: Meeting) => 
      m.id === state.currentMeeting?.id ? updatedMeeting : m
    );
    await saveMeetings(updatedMeetings);
  }, [state.currentMeeting, saveMeetings]);

  const addBookmark = useCallback(async (title: string, description: string, timestamp: number) => {
    if (!state.currentMeeting) return;
    
    const bookmark: Bookmark = {
      id: Date.now().toString(),
      title,
      timestamp,
      description: description || undefined,
      createdAt: new Date().toISOString(),
    };
    
    const updatedMeeting = {
      ...state.currentMeeting,
      bookmarks: [...(state.currentMeeting.bookmarks || []), bookmark],
    };
    
    setState(prev => ({ ...prev, currentMeeting: updatedMeeting }));
    
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const updatedMeetings = currentMeetings.map((m: Meeting) => 
      m.id === state.currentMeeting?.id ? updatedMeeting : m
    );
    await saveMeetings(updatedMeetings);
  }, [state.currentMeeting, saveMeetings]);

  const deleteNote = useCallback(async (noteId: string) => {
    if (!state.currentMeeting) return;
    
    const updatedMeeting = {
      ...state.currentMeeting,
      notes: (state.currentMeeting.notes || []).filter(note => note.id !== noteId),
    };
    
    setState(prev => ({ ...prev, currentMeeting: updatedMeeting }));
    
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const updatedMeetings = currentMeetings.map((m: Meeting) => 
      m.id === state.currentMeeting?.id ? updatedMeeting : m
    );
    await saveMeetings(updatedMeetings);
  }, [state.currentMeeting, saveMeetings]);

  const deleteBookmark = useCallback(async (bookmarkId: string) => {
    if (!state.currentMeeting) return;
    
    const updatedMeeting = {
      ...state.currentMeeting,
      bookmarks: (state.currentMeeting.bookmarks || []).filter(bookmark => bookmark.id !== bookmarkId),
    };
    
    setState(prev => ({ ...prev, currentMeeting: updatedMeeting }));
    
    const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
    const updatedMeetings = currentMeetings.map((m: Meeting) => 
      m.id === state.currentMeeting?.id ? updatedMeeting : m
    );
    await saveMeetings(updatedMeetings);
  }, [state.currentMeeting, saveMeetings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsHydrated(true);
      loadMeetings();
      setupAudio();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [loadMeetings, setupAudio]);

  useEffect(() => {
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
      
      if (Platform.OS === 'web' && streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      } else if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(console.warn);
      }
    };
  }, []);

  const value = useMemo(() => ({
    state,
    meetings: isHydrated ? meetings : [],
    consentGiven,
    processingProgress,
    isHydrated,
    setConsentGiven,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    processMeeting,
    retryProcessing,
    deleteMeeting,
    addNote,
    addBookmark,
    deleteNote,
    deleteBookmark,
  }), [
    state,
    meetings,
    consentGiven,
    processingProgress,
    isHydrated,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    processMeeting,
    retryProcessing,
    deleteMeeting,
    addNote,
    addBookmark,
    deleteNote,
    deleteBookmark,
  ]);

  return value;
});
