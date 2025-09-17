import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Search, User, Clock, Mic, Languages, Volume2, VolumeX, Copy, Share2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';

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
  language?: string;
  onLanguageChange?: (language: string) => void;
  showLiveCaptions?: boolean;
  onToggleLiveCaptions?: () => void;
}

export default function LiveTranscript({
  isRecording,
  duration,
  currentTranscript = '',
  segments = [],
  onHighlight,
  onSpeakerEdit,
  language = 'en',
  onLanguageChange,
  showLiveCaptions = true,
  onToggleLiveCaptions,
}: LiveTranscriptProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerName, setSpeakerName] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  
  const supportedLanguages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  ];

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
  
  const handleLanguageSelect = (langCode: string) => {
    setSelectedLanguage(langCode);
    onLanguageChange?.(langCode);
    setShowLanguageSelector(false);
  };
  
  const copyTranscript = async () => {
    const fullTranscript = segments.map(s => `${s.speaker}: ${s.text}`).join('\n');
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(fullTranscript);
    } else {
      await Clipboard.setStringAsync(fullTranscript);
    }
    Alert.alert('Copied', 'Transcript copied to clipboard');
  };
  
  const shareTranscript = async () => {
    const fullTranscript = segments.map(s => `${s.speaker}: ${s.text}`).join('\n');
    if (Platform.OS === 'web') {
      if (navigator.share) {
        await navigator.share({
          title: 'Meeting Transcript',
          text: fullTranscript,
        });
      } else {
        await copyTranscript();
      }
    } else {
      // On mobile, we'll implement sharing in the next update
      await copyTranscript();
    }
  };

  const filteredSegments = segments.filter(segment =>
    searchQuery ? segment.text.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  return (
    <View style={styles.container}>
      {/* Header with Search and Controls */}
      <View style={styles.header}>
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
        
        <View style={styles.headerControls}>
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => setShowLanguageSelector(!showLanguageSelector)}
          >
            <Languages size={18} color="#FF8C00" />
            <Text style={styles.controlButtonText}>
              {supportedLanguages.find(l => l.code === selectedLanguage)?.flag || '🌐'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={onToggleLiveCaptions}
          >
            {showLiveCaptions ? 
              <Volume2 size={18} color="#10B981" /> : 
              <VolumeX size={18} color="#6B7280" />
            }
          </TouchableOpacity>
          
          {segments.length > 0 && (
            <>
              <TouchableOpacity 
                style={styles.controlButton}
                onPress={copyTranscript}
              >
                <Copy size={18} color="#6B7280" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.controlButton}
                onPress={shareTranscript}
              >
                <Share2 size={18} color="#6B7280" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      
      {/* Language Selector */}
      {showLanguageSelector && (
        <View style={styles.languageSelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {supportedLanguages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languageOption,
                  selectedLanguage === lang.code && styles.selectedLanguage
                ]}
                onPress={() => handleLanguageSelect(lang.code)}
              >
                <Text style={styles.languageFlag}>{lang.flag}</Text>
                <Text style={[
                  styles.languageName,
                  selectedLanguage === lang.code && styles.selectedLanguageName
                ]}>
                  {lang.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      
      {/* Live Captions */}
      {showLiveCaptions && isRecording && currentTranscript && (
        <View style={styles.liveCaptions}>
          <View style={styles.liveCaptionsHeader}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveCaptionsTitle}>Live Captions</Text>
          </View>
          <Text style={styles.liveCaptionsText}>{currentTranscript}</Text>
        </View>
      )}

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
  header: {
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  languageSelector: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  selectedLanguage: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FF8C00',
  },
  languageFlag: {
    fontSize: 16,
  },
  languageName: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  selectedLanguageName: {
    color: '#FF8C00',
  },
  liveCaptions: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  liveCaptionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveCaptionsTitle: {
    fontSize: 12,
    color: '#D1D5DB',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  liveCaptionsText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
    fontWeight: '500',
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