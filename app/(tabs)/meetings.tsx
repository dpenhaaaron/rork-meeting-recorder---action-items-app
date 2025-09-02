import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Users, FileText, Trash2, Mail, Play, RefreshCw, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecording } from '@/hooks/recording-store';
import { Meeting } from '@/types/meeting';

export default function MeetingsScreen() {
  const { meetings, deleteMeeting, processMeeting, retryProcessing, processingProgress } = useRecording();
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [processingMeetingId, setProcessingMeetingId] = useState<string | null>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());

  const gradientColors = [
    ['#FF6B6B', '#FF8E53', '#FF6B9D'] as const, // Coral to Pink
    ['#4ECDC4', '#44A08D', '#093637'] as const, // Teal gradient
    ['#A8E6CF', '#7FCDCD', '#41B3A3'] as const, // Mint gradient
    ['#FFD93D', '#FF6B6B', '#C44569'] as const, // Yellow to Pink
    ['#6C5CE7', '#A29BFE', '#FD79A8'] as const, // Purple to Pink
    ['#00B894', '#00CEC9', '#81ECEC'] as const, // Green gradient
    ['#E17055', '#FDCB6E', '#E84393'] as const, // Orange gradient
    ['#0984E3', '#74B9FF', '#A29BFE'] as const, // Blue gradient
  ];

  const getGradientColor = (index: number) => gradientColors[index % gradientColors.length];

  const toggleSummary = (meetingId: string) => {
    setExpandedSummaries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(meetingId)) {
        newSet.delete(meetingId);
      } else {
        newSet.add(meetingId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const unprocessedMeeting = meetings.find(m => m.status === 'processing' && m.audioUri);
    if (unprocessedMeeting && !processingMeetingId) {
      console.log('Found unprocessed meeting, triggering processing:', unprocessedMeeting.id);
      // Add a small delay to ensure audio file is fully saved
      setTimeout(() => {
        handleProcessMeeting(unprocessedMeeting.id);
      }, 500);
    }
  }, [meetings, processingMeetingId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
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

  const handleDeleteMeeting = (meeting: Meeting) => {
    Alert.alert(
      'Delete Meeting',
      `Are you sure you want to delete "${meeting.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMeeting(meeting.id),
        },
      ]
    );
  };

  const handleProcessMeeting = async (meetingId: string) => {
    if (processingMeetingId) return;
    
    setProcessingMeetingId(meetingId);
    try {
      await processMeeting(meetingId);
      Alert.alert('Success', 'Meeting processed successfully!');
    } catch (error) {
      console.error('Processing failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert(
        'Processing Failed', 
        errorMessage,
        [
          { text: 'OK', style: 'default' },
          { 
            text: 'Retry', 
            style: 'default',
            onPress: () => {
              setTimeout(() => handleProcessMeeting(meetingId), 1000);
            }
          }
        ]
      );
    } finally {
      setProcessingMeetingId(null);
    }
  };

  const handleRetryProcessing = async (meeting: Meeting) => {
    if (processingMeetingId) return;
    
    Alert.alert(
      'Retry Processing',
      `Retry processing "${meeting.title}"? This will attempt to process the recording again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retry',
          onPress: async () => {
            setProcessingMeetingId(meeting.id);
            try {
              await retryProcessing(meeting.id);
              Alert.alert('Success', 'Meeting processed successfully!');
            } catch (error) {
              console.error('Retry processing failed:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              Alert.alert(
                'Processing Failed Again', 
                `${errorMessage}\n\nPlease check your internet connection and try again later.`,
                [{ text: 'OK', style: 'default' }]
              );
            } finally {
              setProcessingMeetingId(null);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: Meeting['status']) => {
    switch (status) {
      case 'recording': return '#EF4444';
      case 'processing': return '#F59E0B';
      case 'completed': return '#10B981';
      case 'error': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getActionItemsCount = (meeting: Meeting) => {
    if (!meeting.artifacts?.action_items) return 0;
    return Array.isArray(meeting.artifacts.action_items) ? meeting.artifacts.action_items.length : 0;
  };

  const getDecisionsCount = (meeting: Meeting) => {
    if (!meeting.artifacts?.decisions) return 0;
    return Array.isArray(meeting.artifacts.decisions) ? meeting.artifacts.decisions.length : 0;
  };

  const getCompletedActionItems = (meeting: Meeting) => {
    if (!meeting.artifacts?.action_items) return 0;
    return Array.isArray(meeting.artifacts.action_items) 
      ? meeting.artifacts.action_items.filter(item => item.status === 'Done').length 
      : 0;
  };

  const getStageDisplayName = (stage: string) => {
    switch (stage) {
      case 'transcribing': return 'Transcribing Audio';
      case 'chunking': return 'Preparing Chunks';
      case 'mapping': return 'Processing Chunks';
      case 'reducing': return 'Merging Sections';
      case 'refining': return 'Creating Summary';
      case 'generating_email': return 'Generating Email';
      case 'completed': return 'Complete';
      default: return 'Processing';
    }
  };

  const handleEmailDraft = async (meeting: Meeting) => {
    if (!meeting.artifacts) {
      Alert.alert('No Data', 'Meeting has not been processed yet.');
      return;
    }

    try {
      const subject = `Meeting Notes: ${meeting.title} - ${new Date(meeting.date).toLocaleDateString()}`;
      
      let body = `Meeting: ${meeting.title}\n`;
      body += `Date: ${new Date(meeting.date).toLocaleDateString()}\n`;
      body += `Duration: ${formatDuration(meeting.duration)}\n\n`;
      
      if (meeting.artifacts.summaries?.executive_120w) {
        body += `SUMMARY:\n${meeting.artifacts.summaries.executive_120w}\n\n`;
      }
      
      if (meeting.artifacts.action_items && meeting.artifacts.action_items.length > 0) {
        body += `ACTION ITEMS:\n`;
        meeting.artifacts.action_items.forEach((item, index) => {
          body += `${index + 1}. ${item.title}`;
          if (item.assignee) body += ` (${item.assignee})`;
          if (item.due_date) body += ` - Due: ${item.due_date}`;
          body += `\n`;
        });
        body += `\n`;
      }
      
      if (meeting.artifacts.decisions && meeting.artifacts.decisions.length > 0) {
        body += `DECISIONS:\n`;
        meeting.artifacts.decisions.forEach((decision, index) => {
          body += `${index + 1}. ${decision.statement}\n`;
        });
        body += `\n`;
      }
      
      body += `Generated by CONVAI`;
      
      const emailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      const canOpen = await Linking.canOpenURL(emailUrl);
      if (canOpen) {
        await Linking.openURL(emailUrl);
      } else {
        Alert.alert('Email Not Available', 'No email app is configured on this device.');
      }
    } catch (error) {
      console.error('Failed to open email:', error);
      Alert.alert('Error', 'Failed to open email app.');
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ 
          title: 'Meetings', 
          headerShown: true,
          headerStyle: {
            backgroundColor: '#FFFFFF',
          },
          headerTitleStyle: {
            color: '#FF8C00',
            fontWeight: 'bold',
          },
        }} />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>All Meetings</Text>
          <Text style={styles.subtitle}>{meetings.length} total meetings</Text>
        </View>

        {meetings.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No meetings recorded</Text>
            <Text style={styles.emptyStateText}>
              Start recording meetings to see them here with AI-generated summaries and action items.
            </Text>
          </View>
        ) : (
          <View style={styles.meetingsList}>
            {meetings.map((meeting, index) => {
              const gradientColor = getGradientColor(index);
              const isExpanded = expandedSummaries.has(meeting.id);
              
              return (
              <TouchableOpacity 
                key={meeting.id} 
                style={styles.meetingCardContainer}
                onPress={() => {
                  // TODO: Navigate to meeting detail screen
                  Alert.alert('Meeting Details', 'Meeting detail view coming soon!');
                }}
              >
                <View style={styles.meetingCard}>
                <View style={styles.meetingHeader}>
                  <View style={styles.meetingInfo}>
                    <Text style={styles.meetingTitle} numberOfLines={2}>
                      {meeting.title}
                    </Text>
                    <Text style={styles.meetingDate}>{formatDate(meeting.date)}</Text>
                  </View>
                  
                  <View style={styles.meetingActions}>
                    <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(meeting.status) }]} />
                    <TouchableOpacity 
                      style={styles.actionButton}
                      onPress={() => handleDeleteMeeting(meeting)}
                    >
                      <Trash2 size={16} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.meetingMeta}>
                  {meeting.duration > 0 && (
                    <View style={styles.metaItem}>
                      <Clock size={14} color="#6B7280" />
                      <Text style={styles.metaText}>{formatDuration(meeting.duration)}</Text>
                    </View>
                  )}
                  
                  {meeting.attendees.length > 0 && (
                    <View style={styles.metaItem}>
                      <Users size={14} color="#6B7280" />
                      <Text style={styles.metaText}>{meeting.attendees.length} attendees</Text>
                    </View>
                  )}
                </View>

                {meeting.artifacts && (
                  <View style={styles.artifactsPreview}>
                    <View style={styles.artifactStats}>
                      <View style={styles.artifactItem}>
                        <View style={styles.artifactHeader}>
                          <CheckCircle size={16} color="#10B981" />
                          <Text style={styles.artifactCount}>
                            {getCompletedActionItems(meeting)}/{getActionItemsCount(meeting)}
                          </Text>
                        </View>
                        <Text style={styles.artifactLabel}>Action Items</Text>
                      </View>
                      
                      <View style={styles.artifactItem}>
                        <View style={styles.artifactHeader}>
                          <AlertCircle size={16} color="#F59E0B" />
                          <Text style={styles.artifactCount}>
                            {getDecisionsCount(meeting)}
                          </Text>
                        </View>
                        <Text style={styles.artifactLabel}>Decisions</Text>
                      </View>
                    </View>
                    
                    <View style={styles.artifactActions}>
                      <TouchableOpacity 
                        style={styles.artifactActionButton}
                        onPress={() => handleEmailDraft(meeting)}
                      >
                        <Mail size={14} color="#FF8C00" />
                        <Text style={styles.actionButtonText}>Email</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={styles.artifactActionButton}
                        onPress={() => toggleSummary(meeting.id)}
                      >
                        {isExpanded ? <ChevronUp size={14} color="#374151" /> : <ChevronDown size={14} color="#374151" />}
                        <Text style={styles.actionButtonText}>Summary</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {meeting.artifacts && isExpanded && (
                  <View style={styles.summarySection}>
                    <Text style={styles.summaryTitle}>Executive Summary</Text>
                    <Text style={styles.summaryText}>
                      {meeting.artifacts.summaries?.executive_120w || 'Summary not available'}
                    </Text>
                    
                    {meeting.artifacts.summaries?.bullet_12 && meeting.artifacts.summaries.bullet_12.length > 0 && (
                      <>
                        <Text style={[styles.summaryTitle, { marginTop: 12 }]}>Key Points</Text>
                        {meeting.artifacts.summaries.bullet_12.slice(0, 5).map((bullet, idx) => (
                          <Text key={idx} style={styles.bulletPoint}>• {bullet}</Text>
                        ))}
                      </>
                    )}
                  </View>
                )}

                {meeting.status === 'processing' && (
                  <View style={styles.processingIndicator}>
                    <View style={styles.processingHeader}>
                      <ActivityIndicator size="small" color="#3B82F6" />
                      <View style={styles.processingTextContainer}>
                        <Text style={styles.processingText}>
                          {processingProgress?.message || 'Processing transcript and generating action items...'}
                        </Text>
                        {processingProgress?.stage && (
                          <Text style={styles.processingStage}>
                            {getStageDisplayName(processingProgress.stage)}
                            {processingProgress.currentChunk && processingProgress.totalChunks && (
                              ` (${processingProgress.currentChunk}/${processingProgress.totalChunks})`
                            )}
                          </Text>
                        )}
                      </View>
                    </View>
                    {processingProgress && (
                      <View style={styles.progressContainer}>
                        <View style={styles.progressBar}>
                          <View 
                            style={[
                              styles.progressFill, 
                              { width: `${processingProgress.progress}%` }
                            ]} 
                          />
                        </View>
                        <Text style={styles.progressText}>
                          {Math.round(processingProgress.progress)}%
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {meeting.status === 'error' && (
                  <TouchableOpacity 
                    style={styles.errorIndicator}
                    onPress={() => handleRetryProcessing(meeting)}
                    disabled={!!processingMeetingId}
                  >
                    <View style={styles.errorHeader}>
                      <RefreshCw size={14} color={processingMeetingId === meeting.id ? '#9CA3AF' : '#EF4444'} />
                      <Text style={[styles.errorText, processingMeetingId === meeting.id && { color: '#9CA3AF' }]}>
                        {processingMeetingId === meeting.id ? 'Retrying...' : 'Processing failed. Tap to retry.'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {meeting.audioUri && meeting.status !== 'processing' && meeting.status !== 'completed' && (
                  <TouchableOpacity 
                    style={styles.processButton}
                    onPress={() => handleProcessMeeting(meeting.id)}
                    disabled={!!processingMeetingId}
                  >
                    <Play size={14} color="#3B82F6" />
                    <Text style={styles.processButtonText}>Process Meeting</Text>
                  </TouchableOpacity>
                )}
                </View>
              </TouchableOpacity>
            );
            })}
          </View>
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
  header: {
    paddingVertical: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  meetingsList: {
    paddingBottom: 40,
  },
  meetingCardContainer: {
    marginBottom: 16,
  },
  meetingCard: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  meetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  meetingInfo: {
    flex: 1,
    marginRight: 16,
  },
  meetingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 4,
    lineHeight: 24,
  },
  meetingDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  meetingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actionButton: {
    padding: 4,
  },
  meetingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  artifactsPreview: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  artifactStats: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  artifactItem: {
    alignItems: 'center',
    marginRight: 32,
  },
  artifactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  artifactCount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  artifactLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  artifactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  artifactActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FF8C00',
  },
  summarySection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#FF8C00',
  },
  summaryText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  bulletPoint: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    paddingLeft: 8,
  },
  processingIndicator: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  processingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  processingTextContainer: {
    flex: 1,
  },
  processingText: {
    fontSize: 12,
    color: '#374151',
    fontStyle: 'italic',
  },
  processingStage: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
    minWidth: 30,
  },
  errorIndicator: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    fontStyle: 'italic',
  },
  processButton: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  processButtonText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
});