import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Mic, Square, Pause, Play, Tag } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onHighlight: () => void;
}

export default function RecordingControls({
  isRecording,
  isPaused,
  duration,
  onStart,
  onPause,
  onResume,
  onStop,
  onHighlight,
}: RecordingControlsProps) {
  
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getRemainingTime = (seconds: number): string => {
    const maxDuration = 15 * 60; // 15 minutes
    const remaining = maxDuration - seconds;
    if (remaining <= 0) return '0:00';
    
    const minutes = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  const isNearLimit = (seconds: number): boolean => {
    const maxDuration = 15 * 60; // 15 minutes
    return seconds > maxDuration - 300; // Last 5 minutes
  };

  const handlePress = (action: () => void) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    action();
  };

  if (!isRecording) {
    return (
      <View style={styles.container}>
        <TouchableOpacity 
          style={styles.startButton} 
          onPress={() => handlePress(onStart)}
          testID="start-recording-button"
        >
          <Mic size={32} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.startText}>Tap to start recording</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.durationContainer}>
        <View style={[styles.recordingIndicator, isPaused && styles.pausedIndicator]} />
        <Text style={[styles.duration, isNearLimit(duration) && styles.warningText]}>
          {formatDuration(duration)}
        </Text>
        <Text style={styles.status}>{isPaused ? 'Paused' : 'Recording'}</Text>
        <Text style={[styles.remainingTime, isNearLimit(duration) && styles.warningText]}>
          {getRemainingTime(duration)} remaining
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity 
          style={styles.highlightButton} 
          onPress={() => handlePress(onHighlight)}
          testID="highlight-button"
        >
          <Tag size={20} color="#FF8C00" />
          <Text style={styles.highlightText}>Highlight</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.pauseButton} 
          onPress={() => handlePress(isPaused ? onResume : onPause)}
          testID="pause-resume-button"
        >
          {isPaused ? <Play size={24} color="#FFFFFF" /> : <Pause size={24} color="#FFFFFF" />}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.stopButton} 
          onPress={() => handlePress(onStop)}
          testID="stop-recording-button"
        >
          <Square size={20} color="#FFFFFF" />
          <Text style={styles.stopText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  startButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  startText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  durationContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    marginBottom: 8,
  },
  pausedIndicator: {
    backgroundColor: '#F59E0B',
  },
  duration: {
    fontSize: 32,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  status: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  remainingTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  warningText: {
    color: '#EF4444',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  highlightButton: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FFF4E6',
    borderWidth: 1,
    borderColor: '#FFE0B3',
  },
  highlightText: {
    fontSize: 12,
    color: '#FF8C00',
    fontWeight: '500',
    marginTop: 4,
  },
  pauseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6B7280',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    gap: 6,
  },
  stopText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});