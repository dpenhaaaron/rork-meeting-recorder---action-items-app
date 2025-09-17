import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Clock, Users, FileText } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRecording } from '@/hooks/recording-store';
import { Meeting } from '@/types/meeting';
import ConsentBanner from '@/components/ConsentBanner';
import RecordingControls from '@/components/RecordingControls';
import WaveformVisualizer from '@/components/WaveformVisualizer';

export default function HomeScreen() {
  const { 
    state, 
    meetings, 
    consentGiven, 
    setConsentGiven, 
    startRecording, 
    pauseRecording, 
    resumeRecording, 
    stopRecording,
    processMeeting,
    retryProcessing 
  } = useRecording();
  
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [attendees, setAttendees] = useState('');
  const [showConsent, setShowConsent] = useState(false);

  const handleStartRecording = () => {
    if (!consentGiven) {
      setShowConsent(true);
      return;
    }
    
    if (!meetingTitle.trim()) {
      Alert.alert('Meeting Title Required', 'Please enter a title for your meeting.');
      return;
    }

    const attendeeList = attendees.split(',').map(name => name.trim()).filter(Boolean);
    
    startRecording(meetingTitle, attendeeList)
      .then(() => {
        setShowNewMeeting(false);
        setMeetingTitle('');
        setAttendees('');
      })
      .catch((error) => {
        Alert.alert('Recording Error', error.message);
      });
  };

  const handleStopRecording = async () => {
    try {
      const meetingId = await stopRecording();
      if (meetingId) {
        Alert.alert(
          'Recording Saved', 
          'Your recording has been saved. Processing will begin shortly.',
          [
            { text: 'OK', style: 'default' }
          ]
        );
        
        // Start processing automatically with better error handling
        const processingTimer = setTimeout(async () => {
          try {
            console.log('Starting auto-processing for meeting:', meetingId);
            
            // Reload meetings to ensure we have the latest state with audio URI
            const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
            const meeting = currentMeetings.find((m: Meeting) => m.id === meetingId);
            
            if (meeting && meeting.audioUri) {
              console.log('Meeting ready for processing:', {
                id: meeting.id,
                audioUri: meeting.audioUri,
                status: meeting.status
              });
              
              await processMeeting(meetingId);
              console.log('Auto-processing completed successfully');
            } else {
              console.error('Meeting not ready for processing:', {
                found: !!meeting,
                audioUri: meeting?.audioUri
              });
            }
          } catch (error) {
            console.error('Auto-processing failed:', error);
            // Update meeting status to error so user can retry
            const currentMeetings = JSON.parse(await AsyncStorage.getItem('meetings') || '[]');
            const updatedMeetings = currentMeetings.map((m: Meeting) => 
              m.id === meetingId 
                ? { ...m, status: 'error' as const }
                : m
            );
            await AsyncStorage.setItem('meetings', JSON.stringify(updatedMeetings));
          }
        }, 3000); // Increased delay to ensure recording is fully saved
        
        // Cleanup timer on unmount
        return () => clearTimeout(processingTimer);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert(
        'Recording Error', 
        error instanceof Error ? error.message : 'Failed to stop recording. Please try again.'
      );
    }
  };

  // Show warning when approaching 15-minute limit
  React.useEffect(() => {
    if (!state.isRecording) return;
    
    try {
      if (state.duration === 10 * 60) { // 10 minutes
        Alert.alert(
          'Recording Limit Warning',
          'Your recording will automatically stop in 5 minutes (15-minute limit). Consider stopping and starting a new recording if needed.',
          [{ text: 'OK' }]
        );
      }
      if (state.duration === 14 * 60) { // 14 minutes
        Alert.alert(
          'One Minute Warning',
          'Your recording will stop in 1 minute. Please prepare to wrap up.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.warn('Alert error:', error);
    }
  }, [state.duration, state.isRecording]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ 
          title: 'CONVAI', 
          headerShown: true,
          headerStyle: {
            backgroundColor: '#FFFFFF',
          },
          headerTitleStyle: {
            color: '#FF8C00',
            fontWeight: 'bold',
            fontStyle: 'italic',
          },
        }} />
      
      <ConsentBanner
        visible={showConsent}
        onAccept={() => {
          setConsentGiven(true);
          setShowConsent(false);
          handleStartRecording();
        }}
        onDecline={() => setShowConsent(false)}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {state.isRecording ? (
          <View style={styles.recordingSection}>
            <Text style={styles.recordingTitle}>{state.currentMeeting?.title}</Text>
            <WaveformVisualizer 
              isRecording={state.isRecording} 
              isPaused={state.isPaused}
              audioLevels={state.audioLevels}
            />
            <RecordingControls
              isRecording={state.isRecording}
              isPaused={state.isPaused}
              duration={state.duration}
              onStart={handleStartRecording}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onStop={handleStopRecording}
              onHighlight={() => {
                Alert.alert('Highlight Added', 'This moment has been marked for review.');
              }}
            />
          </View>
        ) : (
          <>
            {showNewMeeting ? (
              <View style={styles.newMeetingForm}>
                <Text style={styles.formTitle}>New Meeting</Text>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Meeting Title *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={meetingTitle}
                    onChangeText={setMeetingTitle}
                    placeholder="e.g., Weekly Team Standup"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Attendees (optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={attendees}
                    onChangeText={setAttendees}
                    placeholder="John, Sarah, Mike (comma separated)"
                    placeholderTextColor="#9CA3AF"
                    multiline
                  />
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Language</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.languageSelector}>
                    {supportedLanguages.map((lang) => (
                      <TouchableOpacity
                        key={lang.code}
                        style={[
                          styles.languageOption,
                          selectedLanguage === lang.code && styles.selectedLanguageOption
                        ]}
                        onPress={() => setSelectedLanguage(lang.code)}
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

                <View style={styles.formActions}>
                  <TouchableOpacity 
                    style={styles.cancelButton} 
                    onPress={() => setShowNewMeeting(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.startButton} 
                    onPress={handleStartRecording}
                  >
                    <Text style={styles.startButtonText}>Start Recording</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.quickStart}>
                <TouchableOpacity 
                  style={styles.newMeetingButton}
                  onPress={() => setShowNewMeeting(true)}
                >
                  <Plus size={24} color="#FFFFFF" />
                  <Text style={styles.newMeetingButtonText}>New Session</Text>
                </TouchableOpacity>
                
                <Text style={styles.quickStartText}>
                  AI-powered meeting assistant with real-time transcription, smart summaries, and multi-language support
                </Text>
                
                {/* Feature Highlights */}
                <View style={styles.featureHighlights}>
                  <View style={styles.featureItem}>
                    <Languages size={20} color="#FF8C00" />
                    <Text style={styles.featureText}>50+ Languages</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Zap size={20} color="#FF8C00" />
                    <Text style={styles.featureText}>Real-time AI</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <TrendingUp size={20} color="#FF8C00" />
                    <Text style={styles.featureText}>Smart Insights</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.recentMeetings}>
              <Text style={styles.sectionTitle}>Recent Meetings</Text>
              
              {meetings.length === 0 ? (
                <View style={styles.emptyState}>
                  <FileText size={48} color="#D1D5DB" />
                  <Text style={styles.emptyStateText}>No meetings yet</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Start your first recording to see it here
                  </Text>
                </View>
              ) : (
                meetings.slice(0, 5).map((meeting, index) => {
                  const gradientColors = [
                    ['#FF6B6B', '#FF8E53', '#FF6B9D'] as const,
                    ['#4ECDC4', '#44A08D', '#093637'] as const,
                    ['#A8E6CF', '#7FCDCD', '#41B3A3'] as const,
                    ['#FFD93D', '#FF6B6B', '#C44569'] as const,
                    ['#6C5CE7', '#A29BFE', '#FD79A8'] as const,
                    ['#00B894', '#00CEC9', '#81ECEC'] as const,
                    ['#E17055', '#FDCB6E', '#E84393'] as const,
                    ['#0984E3', '#74B9FF', '#A29BFE'] as const,
                  ];
                  const gradientColor = gradientColors[index % gradientColors.length];
                  
                  const handleMeetingPress = () => {
                    if (meeting.status === 'error') {
                      try {
                        Alert.alert(
                          'Processing Failed',
                          `The meeting "${meeting.title}" failed to process. Would you like to retry?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { 
                              text: 'Retry', 
                              onPress: () => {
                                retryProcessing(meeting.id).catch((error) => {
                                  console.error('Retry processing error:', error);
                                  try {
                                    Alert.alert(
                                      'Retry Failed',
                                      'Processing failed again. Please check your internet connection and try again later.',
                                      [{ text: 'OK' }]
                                    );
                                  } catch (alertError) {
                                    console.error('Alert error:', alertError);
                                  }
                                });
                              }
                            }
                          ]
                        );
                      } catch (error) {
                        console.error('Alert error:', error);
                      }
                    }
                  };
                  
                  return (
                  <TouchableOpacity 
                    key={meeting.id} 
                    style={styles.meetingCardContainer}
                    onPress={handleMeetingPress}
                    disabled={meeting.status !== 'error'}
                  >
                    <LinearGradient
                      colors={gradientColor}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.meetingCard}
                    >
                    <View style={styles.meetingHeader}>
                      <Text style={styles.meetingTitle} numberOfLines={1}>
                        {meeting.title}
                      </Text>
                      <View style={[styles.statusBadge, meeting.status === 'error' && styles.errorBadge]}>
                        <Text style={[styles.statusText, meeting.status === 'error' && styles.errorText]}>
                          {meeting.status === 'error' ? 'Tap to retry' : meeting.status}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.meetingMeta}>
                      <View style={styles.metaItem}>
                        <Clock size={14} color="#6B7280" />
                        <Text style={styles.metaText}>{formatDate(meeting.date)}</Text>
                      </View>
                      
                      {meeting.duration > 0 && (
                        <View style={styles.metaItem}>
                          <Text style={styles.metaText}>•</Text>
                          <Text style={styles.metaText}>{formatDuration(meeting.duration)}</Text>
                        </View>
                      )}
                      
                      {meeting.attendees.length > 0 && (
                        <View style={styles.metaItem}>
                          <Users size={14} color="#6B7280" />
                          <Text style={styles.metaText}>{meeting.attendees.length}</Text>
                        </View>
                      )}
                    </View>
                    </LinearGradient>
                  </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  recordingSection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  recordingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF8C00',
    textAlign: 'center',
    marginBottom: 20,
  },
  quickStart: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  newMeetingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C00',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  newMeetingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  quickStartText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  newMeetingForm: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  startButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#FF8C00',
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  recentMeetings: {
    marginTop: 32,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  meetingCardContainer: {
    marginBottom: 12,
  },
  meetingCard: {
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  meetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  meetingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
    color: '#6B7280',
  },
  meetingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  errorBadge: {
    backgroundColor: '#FEE2E2',
  },
  errorText: {
    color: '#DC2626',
    textTransform: 'none',
  },
});