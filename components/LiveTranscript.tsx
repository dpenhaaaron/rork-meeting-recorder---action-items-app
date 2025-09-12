import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Search, User, Clock, Mic } from 'lucide-react-native';

interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
  confidence: number;
  isHighlight?: boolean;
}

interface LiveTranscriptProps {
  isRecording: boolean;
  duration: number;
  currentTranscript?: string;
  segments?: TranscriptSegment[];
  onHighlight?: (segmentId: string) => void;
  onSpeakerEdit?: (segmentId: string, newSpeaker: string) => void;
}

export default function LiveTranscript({
  isRecording,
  duration,
  currentTranscript = '',
  segments = [],
  onHighlight,
  onSpeakerEdit,
}: LiveTranscriptProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerName, setSpeakerName] = useState('');

  useEffect(() => {
    // Auto-scroll to bottom when new content is added
    if (isRecording && scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [currentTranscript, segments, isRecording]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSpeakerSave = (segmentId: string) => {
    if (onSpeakerEdit && speakerName.trim()) {
      onSpeakerEdit(segmentId, speakerName.trim());
    }
    setEditingSpeaker(null);
    setSpeakerName('');
  };

  const filteredSegments = segments.filter(segment =>
    searchQuery ? segment.text.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Search size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transcript..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Live Transcript */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.transcriptContainer}
        showsVerticalScrollIndicator={false}
      >
        {filteredSegments.length > 0 ? (
          filteredSegments.map((segment) => (
            <TouchableOpacity
              key={segment.id}
              style={[
                styles.segment,
                segment.isHighlight && styles.highlightedSegment
              ]}
              onPress={() => onHighlight?.(segment.id)}
              activeOpacity={0.7}
            >
              <View style={styles.segmentHeader}>
                <View style={styles.speakerInfo}>
                  <User size={16} color="#6B7280" />
                  {editingSpeaker === segment.id ? (
                    <TextInput
                      style={styles.speakerInput}
                      value={speakerName}
                      onChangeText={setSpeakerName}
                      onBlur={() => handleSpeakerSave(segment.id)}
                      onSubmitEditing={() => handleSpeakerSave(segment.id)}
                      placeholder={segment.speaker}
                      autoFocus
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingSpeaker(segment.id);
                        setSpeakerName(segment.speaker);
                      }}
                    >
                      <Text style={styles.speakerName}>{segment.speaker}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.timestampContainer}>
                  <Clock size={14} color="#9CA3AF" />
                  <Text style={styles.timestamp}>
                    {formatTime(segment.timestamp)}
                  </Text>
                </View>
              </View>
              <Text style={styles.segmentText}>{segment.text}</Text>
              {segment.confidence < 0.8 && (
                <Text style={styles.lowConfidence}>Low confidence</Text>
              )}
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            {isRecording ? (
              <>
                <Mic size={32} color="#FF8C00" />
                <Text style={styles.listeningText}>Listening...</Text>
                {currentTranscript && (
                  <Text style={styles.currentText}>{currentTranscript}</Text>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>
                Transcript will appear here when recording starts
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Recording Indicator */}
      {isRecording && (
        <View style={styles.recordingIndicator}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording • {formatTime(duration)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#111827',
  },
  transcriptContainer: {
    flex: 1,
    padding: 16,
  },
  segment: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  highlightedSegment: {
    backgroundColor: '#FEF3C7',
    borderLeftColor: '#FF8C00',
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  speakerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  speakerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  speakerInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    borderBottomWidth: 1,
    borderBottomColor: '#FF8C00',
    paddingVertical: 0,
    minWidth: 100,
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  segmentText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
  },
  lowConfidence: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  listeningText: {
    fontSize: 16,
    color: '#FF8C00',
    marginTop: 12,
    fontWeight: '500',
  },
  currentText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 16,
    paddingHorizontal: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FEF3C7',
    borderTopWidth: 1,
    borderTopColor: '#FCD34D',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#92400E',
  },
});